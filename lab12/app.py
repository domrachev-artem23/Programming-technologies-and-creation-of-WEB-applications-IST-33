import os
from datetime import date,timedelta
from decimal import Decimal,InvalidOperation
from functools import wraps
from flask import Flask,jsonify,request,g,send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import psycopg2,jwt
from psycopg2.extras import RealDictCursor
from werkzeug.security import generate_password_hash,check_password_hash
from werkzeug.exceptions import HTTPException
load_dotenv()
app=Flask(__name__); app.config['SECRET_KEY']=os.getenv('SECRET_KEY','local-secret-change-me')
CORS(app,resources={r'/api/*':{'origins':'*'}})
def db():
 return psycopg2.connect(host=os.getenv('DB_HOST','localhost'),port=os.getenv('DB_PORT','5432'),dbname=os.getenv('DB_NAME','finbuddy'),user=os.getenv('DB_USER','postgres'),password=os.getenv('DB_PASSWORD',''),cursor_factory=RealDictCursor)
def token_required(fn):
 @wraps(fn)
 def wrapped(*a,**kw):
  try:
   raw=request.headers.get('Authorization','').removeprefix('Bearer ').strip()
   g.user_id=int(jwt.decode(raw,app.config['SECRET_KEY'],algorithms=['HS256'])['user_id'])
  except Exception:return jsonify(error='Требуется авторизация'),401
  return fn(*a,**kw)
 return wrapped
def fail(msg,status=400):return jsonify(error=msg),status
def out(row):
 if row is None:return None
 return {k:(float(v) if isinstance(v,Decimal) else v.isoformat() if hasattr(v,'isoformat') else v) for k,v in dict(row).items()}
@app.get('/')
def home():
 return send_from_directory(os.path.dirname(os.path.abspath(__file__)),'index.html')

@app.get('/api/health')
def health():
 try:
  with db() as c:c.cursor().execute('SELECT 1')
  return jsonify(status='ok',database='connected')
 except Exception as e:return jsonify(status='error',database='disconnected',message=str(e)),503
@app.post('/api/auth/register')
def register():
 d=request.get_json(silent=True) or {}; name=str(d.get('name','')).strip(); email=str(d.get('email','')).strip().lower(); password=str(d.get('password',''))
 if len(name)<2 or '@' not in email or len(password)<8:return fail('Укажите имя, корректный email и пароль не короче 8 символов')
 try:
  with db() as c:
   with c.cursor() as q:
    q.execute('INSERT INTO users(name,email,password_hash) VALUES(%s,%s,%s) RETURNING id,name,email',(name,email,generate_password_hash(password))); u=q.fetchone()
    for n,col in [('Продукты','#14b887'),('Транспорт','#f5a623'),('Покупки','#a66cff'),('Развлечения','#ef647b'),('Здоровье','#42a5f5'),('Жильё','#73849a')]:q.execute('INSERT INTO categories(user_id,name,color) VALUES(%s,%s,%s)',(u['id'],n,col))
  return jsonify(user=out(u),token=jwt.encode({'user_id':u['id']},app.config['SECRET_KEY'],algorithm='HS256')),201
 except psycopg2.errors.UniqueViolation:return fail('Email уже зарегистрирован',409)
 except Exception as e:return fail(str(e),500)
@app.post('/api/auth/login')
def login():
 d=request.get_json(silent=True) or {}
 try:
  with db() as c:
   with c.cursor() as q:q.execute('SELECT id,name,email,password_hash FROM users WHERE lower(email)=lower(%s)',(str(d.get('email','')).strip(),));u=q.fetchone()
  if not u or not check_password_hash(u['password_hash'],str(d.get('password',''))):return fail('Неверный email или пароль',401)
  return jsonify(user={k:v for k,v in out(u).items() if k!='password_hash'},token=jwt.encode({'user_id':u['id']},app.config['SECRET_KEY'],algorithm='HS256'))
 except Exception as e:return fail(str(e),500)
@app.get('/api/categories')
@token_required
def categories():
 with db() as c:
  with c.cursor() as q:q.execute('SELECT id,name,color FROM categories WHERE user_id=%s ORDER BY name',(g.user_id,));rows=q.fetchall()
 return jsonify([out(x) for x in rows])
@app.post('/api/categories')
@token_required
def add_category():
 d=request.get_json(silent=True) or {};name=str(d.get('name','')).strip()
 if not name:return fail('Введите название категории')
 try:
  with db() as c:
   with c.cursor() as q:q.execute('INSERT INTO categories(user_id,name,color) VALUES(%s,%s,%s) RETURNING *',(g.user_id,name,d.get('color','#10b981')));r=q.fetchone()
  return jsonify(out(r)),201
 except psycopg2.errors.UniqueViolation:return fail('Такая категория уже существует',409)
@app.get('/api/expenses')
@token_required
def expenses():
 wh=['e.user_id=%s']; vals=[g.user_id]; search=request.args.get('search','').strip()
 if search:wh.append('(e.description ILIKE %s OR c.name ILIKE %s)');vals += ['%'+search+'%','%'+search+'%']
 if request.args.get('category_id'):
  try:wh.append('e.category_id=%s');vals.append(int(request.args['category_id']))
  except ValueError:return fail('category_id должен быть числом')
 start=request.args.get('start');end=request.args.get('end');period=request.args.get('period');today=date.today()
 if period=='day':start=end=today.isoformat()
 elif period=='week':start=(today-timedelta(days=6)).isoformat();end=today.isoformat()
 elif period=='month':start=today.replace(day=1).isoformat();end=today.isoformat()
 for key,val,op in [('start',start,'>='),('end',end,'<=')]:
  if val:
   try:date.fromisoformat(val)
   except ValueError:return fail('Дата должна иметь формат YYYY-MM-DD')
   wh.append('e.spent_on '+op+' %s');vals.append(val)
 with db() as c:
  with c.cursor() as q:q.execute('SELECT e.id,e.amount,e.spent_on,e.description,e.category_id,c.name category,c.color FROM expenses e JOIN categories c ON c.id=e.category_id WHERE '+' AND '.join(wh)+' ORDER BY e.spent_on DESC,e.id DESC',vals);rows=q.fetchall()
 return jsonify([out(x) for x in rows])
def validate(d,partial=False):
 if not partial or 'amount' in d:
  try:
   if Decimal(str(d.get('amount',0)))<=0:return 'Сумма должна быть больше нуля'
  except (InvalidOperation,TypeError):return 'Сумма должна быть числом'
 if not partial or 'category_id' in d:
  try:
   if int(d.get('category_id',0))<1:return 'Выберите категорию'
  except (TypeError,ValueError):return 'Некорректная категория'
 if 'spent_on' in d:
  try:date.fromisoformat(str(d['spent_on']))
  except ValueError:return 'Дата должна иметь формат YYYY-MM-DD'
 return None
@app.post('/api/expenses')
@token_required
def add_expense():
 d=request.get_json(silent=True)
 if not isinstance(d,dict):return fail('Ожидается JSON')
 err=validate(d)
 if err:return fail(err)
 with db() as c:
  with c.cursor() as q:
   q.execute('SELECT id FROM categories WHERE id=%s AND user_id=%s',(int(d['category_id']),g.user_id))
   if not q.fetchone():return fail('Категория не найдена',404)
   q.execute('INSERT INTO expenses(user_id,category_id,amount,spent_on,description) VALUES(%s,%s,%s,%s,%s) RETURNING id,amount,spent_on,description,category_id',(g.user_id,int(d['category_id']),Decimal(str(d['amount'])),d.get('spent_on') or date.today().isoformat(),str(d.get('description','')).strip()));r=q.fetchone()
 return jsonify(out(r)),201
@app.put('/api/expenses/<int:rid>')
@token_required
def edit_expense(rid):
 d=request.get_json(silent=True)
 if not isinstance(d,dict):return fail('Ожидается JSON')
 err=validate(d,True)
 if err:return fail(err)
 cols=[];vals=[]
 for k in ('amount','category_id','spent_on','description'):
  if k in d:cols.append(k+'=%s');vals.append(d[k])
 if not cols:return fail('Нет данных для изменения')
 if 'category_id' in d:
  with db() as c:
   with c.cursor() as q:q.execute('SELECT id FROM categories WHERE id=%s AND user_id=%s',(d['category_id'],g.user_id))
   if not q.fetchone():return fail('Категория не найдена',404)
 vals.extend([rid,g.user_id])
 with db() as c:
  with c.cursor() as q:q.execute('UPDATE expenses SET '+','.join(cols)+',updated_at=NOW() WHERE id=%s AND user_id=%s RETURNING id,amount,spent_on,description,category_id',vals);r=q.fetchone()
 if not r:return fail('Расход не найден',404)
 return jsonify(out(r))
@app.delete('/api/expenses/<int:rid>')
@token_required
def delete_expense(rid):
 with db() as c:
  with c.cursor() as q:q.execute('DELETE FROM expenses WHERE id=%s AND user_id=%s RETURNING id',(rid,g.user_id));r=q.fetchone()
 if not r:return fail('Расход не найден',404)
 return jsonify(deleted=True,id=rid)
@app.get('/api/statistics/total')
@token_required
def total():
 start=request.args.get('start');end=request.args.get('end');period=request.args.get('period');today=date.today()
 if period=='day':start=end=today.isoformat()
 elif period=='week':start=(today-timedelta(days=6)).isoformat();end=today.isoformat()
 elif period=='month':start=today.replace(day=1).isoformat();end=today.isoformat()
 if period and period not in ('day','week','month'):return fail('period должен быть day, week или month')
 for value in (start,end):
  if value:
   try:date.fromisoformat(value)
   except ValueError:return fail('Дата должна иметь формат YYYY-MM-DD')
 if start and end and start>end:return fail('start не может быть позже end')
 wh=['user_id=%s'];vals=[g.user_id]
 for key,value,op in [('start',start,'>='),('end',end,'<=')]:
  if value:wh.append('spent_on '+op+' %s');vals.append(value)
 with db() as c:
  with c.cursor() as q:q.execute('SELECT COALESCE(SUM(amount),0) total,COUNT(*) count FROM expenses WHERE '+' AND '.join(wh),vals);r=q.fetchone()
 return jsonify({**out(r),'period':{'start':start,'end':end,'preset':period}})
@app.get('/api/statistics/categories')
@token_required
def category_stats():
 start=request.args.get('start');end=request.args.get('end');period=request.args.get('period');today=date.today()
 if period=='day':start=end=today.isoformat()
 elif period=='week':start=(today-timedelta(days=6)).isoformat();end=today.isoformat()
 elif period=='month':start=today.replace(day=1).isoformat();end=today.isoformat()
 if period and period not in ('day','week','month'):return fail('period должен быть day, week или month')
 for value in (start,end):
  if value:
   try:date.fromisoformat(value)
   except ValueError:return fail('Дата должна иметь формат YYYY-MM-DD')
 if start and end and start>end:return fail('start не может быть позже end')
 wh=['e.user_id=%s'];vals=[g.user_id]
 for key,value,op in [('start',start,'>='),('end',end,'<=')]:
  if value:wh.append('e.spent_on '+op+' %s');vals.append(value)
 with db() as c:
  with c.cursor() as q:q.execute('SELECT c.id,c.name,c.color,SUM(e.amount) amount,COUNT(*) count FROM expenses e JOIN categories c ON c.id=e.category_id WHERE '+' AND '.join(wh)+' GROUP BY c.id ORDER BY amount DESC',vals);rows=q.fetchall()
 total=sum((x['amount'] for x in rows),Decimal(0))
 return jsonify([dict(out(x),percent=round(float(x['amount']*100/total),2) if total else 0) for x in rows])
@app.get('/api/statistics/dynamics')
@token_required
def dynamics():
 try:days=min(max(int(request.args.get('days',30)),1),365)
 except ValueError:return fail('days должен быть числом')
 with db() as c:
  with c.cursor() as q:q.execute('SELECT spent_on date,SUM(amount) total FROM expenses WHERE user_id=%s AND spent_on>=CURRENT_DATE-(%s::int-1) GROUP BY spent_on ORDER BY spent_on',(g.user_id,days));rows=q.fetchall()
 return jsonify([out(x) for x in rows])
@app.errorhandler(404)
def not_found(_):return jsonify(error='Маршрут не найден'),404
@app.errorhandler(405)
def bad_method(_):return jsonify(error='Метод не поддерживается'),405
@app.errorhandler(Exception)
def unexpected_error(error):
 if isinstance(error,HTTPException):return jsonify(error=error.description),error.code
 app.logger.exception('Unhandled API error')
 return jsonify(error='Внутренняя ошибка сервера'),500
if __name__=='__main__':app.run(host='127.0.0.1',port=int(os.getenv('PORT','5000')),debug=False)
