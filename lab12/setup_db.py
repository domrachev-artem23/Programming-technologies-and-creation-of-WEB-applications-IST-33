import os,re
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from werkzeug.security import generate_password_hash
from psycopg2 import sql
BASE=Path(__file__).resolve().parent
load_dotenv(BASE/'.env')
name=os.getenv('DB_NAME','finbuddy')
if not re.fullmatch(r'[A-Za-z0-9_]+',name): raise SystemExit('Недопустимое имя базы данных в .env')
conn_args=dict(host=os.getenv('DB_HOST','localhost'),port=os.getenv('DB_PORT','5432'),user=os.getenv('DB_USER','postgres'),password=os.getenv('DB_PASSWORD',''))
try:
 conn=psycopg2.connect(dbname='postgres',**conn_args);conn.autocommit=True
 with conn.cursor() as cur:
  cur.execute('SELECT 1 FROM pg_database WHERE datname=%s',(name,))
  if not cur.fetchone():cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
 conn.close()
 conn=psycopg2.connect(dbname=name,**conn_args);conn.autocommit=True
 with conn.cursor() as cur:
  cur.execute((BASE/'schema.sql').read_text(encoding='utf-8'))
  cur.execute((BASE/'seed.sql').read_text(encoding='utf-8'))
  cur.execute("UPDATE users SET password_hash=%s WHERE email='artemiy@example.test' AND password_hash=''",(generate_password_hash('finbuddy123'),))
 conn.close()
 print('База FinBuddy и таблицы готовы.')
except Exception as exc:
 raise SystemExit('Не удалось подключиться к PostgreSQL. Проверьте PostgreSQL и параметры в .env. Детали: '+str(exc))
