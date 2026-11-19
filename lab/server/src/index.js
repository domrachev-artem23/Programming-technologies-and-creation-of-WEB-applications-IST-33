import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import crypto from 'node:crypto';
import { readFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { promisify } from 'node:util';

// Загружаем .env относительно папки server, независимо от текущей рабочей директории.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
const app = express();
const PORT = Number(process.env.PORT || 4000);
const UPLOAD_DIR = fileURLToPath(new URL('../uploads/',import.meta.url));
await mkdir(UPLOAD_DIR,{recursive:true});
const upload = multer({storage:multer.diskStorage({destination:UPLOAD_DIR,filename:(req,file,cb)=>cb(null,`${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)}),limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();const ok=['.pdf','.png','.jpg','.jpeg'].includes(ext)&&['application/pdf','image/png','image/jpeg'].includes(file.mimetype);cb(ok?null:new Error('Разрешены только PDF, PNG и JPEG'),ok);}});
// Локальный секрет по умолчанию нужен только для учебного запуска.
const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV !== 'production'
    ? 'healthhub-local-development-secret-change-before-deploy-2026'
    : ''
);
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET не задан. Укажите секрет длиной не менее 32 символов в server/.env');
}
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET слишком короткий. Используйте не менее 32 символов.');
}
const scrypt = promisify(crypto.scrypt);
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '2mb' }));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');next();});

function tokenFor(user){ return jwt.sign({id:user.id,role:user.role}, JWT_SECRET, {expiresIn:'8h'}); }
function auth(req,res,next){
  const raw = req.headers.authorization || '';
  try { if(!raw.startsWith('Bearer ')) throw new Error('token'); req.user=jwt.verify(raw.slice(7),JWT_SECRET); next(); }
  catch { return res.status(401).json({error:'Сессия истекла. Войдите снова.'}); }
}
const roles = (...allowed)=>(req,res,next)=> allowed.includes(req.user.role) ? next() : res.status(403).json({error:'Недостаточно прав'});
const asyncRoute = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const metricRules = {
  'Пульс':{min:25,max:240,unit:'уд/мин'}, 'SpO₂':{min:50,max:100,unit:'%'},
  'Температура':{min:30,max:45,unit:'°C'}, 'Шаги':{min:0,max:100000,unit:'шагов'}, 'Сон':{min:0,max:24,unit:'ч'}
};
const audit = (actor,action,entity,id=null)=>pool.query('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[actor,action,entity,id]).catch(()=>{});
const notify = (user,title,body,kind='info',related=null)=>pool.query('INSERT INTO notifications(user_id,title,body,kind,related_type,related_id) VALUES($1,$2,$3,$4,$5,$6)',[user,title,body,kind,related?.type||null,related?.id||null]).catch(()=>{});

app.get('/api/health', asyncRoute(async(req,res)=>{await pool.query('SELECT 1');res.json({ok:true,service:'HealthHub AI API',database:'connected'});}));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
  if(!email||!password) return res.status(400).json({error:'Введите email и пароль'});
  const {rows}=await pool.query('SELECT id,full_name,email,role,password_hash FROM users WHERE lower(email)=$1 AND is_active=true',[email]);
  const u=rows[0]; if(!u || !(await verifyPassword(password,u.password_hash))) return res.status(401).json({error:'Неверный email или пароль'});
  const user={id:u.id,name:u.full_name,email:u.email,role:u.role};
  await audit(u.id,'login','users',u.id); res.json({token:tokenFor(u),user});
}));
app.post('/api/auth/register', asyncRoute(async(req,res)=>{
  const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||password.length<8) return res.status(400).json({error:'Укажите имя, корректный email и пароль не короче 8 символов'});
  const hash=await hashPassword(password); const q=await pool.query("INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,'patient') RETURNING id,full_name,email,role",[name,email,hash]);
  await pool.query('INSERT INTO patient_profiles(user_id) VALUES($1)',[q.rows[0].id]);
  const u=q.rows[0];res.status(201).json({token:tokenFor(u),user:{id:u.id,name:u.full_name,email:u.email,role:u.role}});
}));
app.get('/api/me',auth,asyncRoute(async(req,res)=>{const q=await pool.query('SELECT id,full_name AS name,email,role FROM users WHERE id=$1',[req.user.id]);res.json(q.rows[0]||{});}));
app.get('/api/dashboard',auth,asyncRoute(async(req,res)=>{
  const [n]=await Promise.all([pool.query('SELECT count(*)::int AS unread FROM notifications WHERE user_id=$1 AND is_read=false',[req.user.id])]);
  if(req.user.role==='doctor'){
    const a=await pool.query(`SELECT a.id,a.starts_at,a.status,u.full_name AS patient,d.full_name AS doctor,s.name AS specialty,c.name AS clinic FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=a.patient_id LEFT JOIN specialties s ON s.id=d.specialty_id LEFT JOIN clinics c ON c.id=d.clinic_id WHERE d.user_id=$1 AND a.status<>'Отменена' ORDER BY starts_at LIMIT 10`,[req.user.id]);
    return res.json({metrics:[],appointments:a.rows,unread:n.rows[0].unread,readyLabs:0});
  }
  if(req.user.role==='admin') return res.json({metrics:[],appointments:[],unread:n.rows[0].unread,readyLabs:0});
  const [m,a,l,steps]=await Promise.all([
    pool.query(`SELECT DISTINCT ON(metric) id,metric,value,unit,measured_at FROM health_measurements WHERE patient_id=$1 AND metric<>'Шаги' ORDER BY metric,measured_at DESC`,[req.user.id]),
    pool.query(`SELECT a.id,a.starts_at,a.status,d.full_name AS doctor,s.name AS specialty,c.name AS clinic FROM appointments a JOIN doctors d ON d.id=a.doctor_id LEFT JOIN specialties s ON s.id=d.specialty_id LEFT JOIN clinics c ON c.id=d.clinic_id WHERE a.patient_id=$1 AND a.status<>'Отменена' ORDER BY starts_at LIMIT 5`,[req.user.id]),
    pool.query("SELECT count(*)::int AS count FROM lab_tests WHERE patient_id=$1 AND status='Готов'",[req.user.id]),
    pool.query(`SELECT id,metric,value,unit,measured_at FROM health_measurements WHERE patient_id=$1 AND metric='Шаги' AND measured_at::date=CURRENT_DATE ORDER BY measured_at DESC LIMIT 1`,[req.user.id])
  ]);
  res.json({metrics:[...m.rows,...steps.rows],appointments:a.rows,unread:n.rows[0].unread,readyLabs:l.rows[0].count});
}));
async function resolvePatientId(user){
 if(user.role==='patient') return user.id;
 if(user.role==='doctor') return null;
 return null;
}
function requirePatient(req,res){if(req.user.role!=='patient') {res.status(403).json({error:'Раздел доступен пациенту'});return false;}return true;}
app.get('/api/measurements',auth,asyncRoute(async(req,res)=>{
 if(req.user.role!=='patient')return res.json([]);
 const days=Math.min(Math.max(Number.parseInt(req.query.period||'7',10)||7,1),90);
 const metric=req.query.metric?String(req.query.metric):null;
 const q=await pool.query(`SELECT id,metric,value,unit,measured_at,source,comment FROM health_measurements WHERE patient_id=$1 AND measured_at>=CASE WHEN $2=1 THEN date_trunc('day',now()) ELSE now()-($2::text||' days')::interval END AND ($3::text IS NULL OR metric=$3) ORDER BY measured_at DESC`,[req.user.id,days,metric]);res.json(q.rows);
}));
app.post('/api/measurements',auth,asyncRoute(async(req,res)=>{
 if(!requirePatient(req,res))return;
 const metric=String(req.body.metric||''),rule=metricRules[metric],value=Number(req.body.value);
 if(!rule||!Number.isFinite(value)||value<rule.min||value>rule.max)return res.status(400).json({error:'Проверьте тип показателя и допустимый диапазон значения'});
 const measuredAt=req.body.measured_at?new Date(req.body.measured_at):new Date(); if(Number.isNaN(measuredAt.getTime())||measuredAt>new Date(Date.now()+5*60*1000))return res.status(400).json({error:'Некорректная дата измерения'});
 const q=await pool.query('INSERT INTO health_measurements(patient_id,metric,value,unit,measured_at,source,comment) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[req.user.id,metric,value,rule.unit,measuredAt, String(req.body.source||'Вручную').slice(0,80),String(req.body.comment||'').slice(0,500)]);
 await audit(req.user.id,'create','health_measurements',q.rows[0].id);res.status(201).json(q.rows[0]);
}));
app.patch('/api/measurements/:id',auth,asyncRoute(async(req,res)=>{
 if(!requirePatient(req,res))return;
 const metric=String(req.body.metric||''),rule=metricRules[metric],value=Number(req.body.value);
 if(!rule||!Number.isFinite(value)||value<rule.min||value>rule.max)return res.status(400).json({error:'Некорректное значение'});
 const measuredAt=req.body.measured_at?new Date(req.body.measured_at):null;if(measuredAt&&Number.isNaN(measuredAt.getTime()))return res.status(400).json({error:'Некорректная дата измерения'});
 const q=await pool.query('UPDATE health_measurements SET metric=$1,value=$2,unit=$3,comment=$4,measured_at=COALESCE($5,measured_at),updated_at=now() WHERE id=$6 AND patient_id=$7 RETURNING *',[metric,value,rule.unit,String(req.body.comment||'').slice(0,500),measuredAt,req.params.id,req.user.id]);
 if(!q.rowCount)return res.status(404).json({error:'Измерение не найдено'});await audit(req.user.id,'update','health_measurements',Number(req.params.id));res.json(q.rows[0]);
}));
app.delete('/api/measurements/:id',auth,asyncRoute(async(req,res)=>{
 if(!requirePatient(req,res))return;const q=await pool.query('DELETE FROM health_measurements WHERE id=$1 AND patient_id=$2 RETURNING id',[req.params.id,req.user.id]);
 if(!q.rowCount)return res.status(404).json({error:'Измерение не найдено'});await audit(req.user.id,'delete','health_measurements',Number(req.params.id));res.json({ok:true});
}));
app.get('/api/analytics',auth,asyncRoute(async(req,res)=>{
 if(req.user.role!=='patient')return res.json({summary:[],history:[],period:Number(req.query.period)||7});const days=Math.min(Math.max(Number(req.query.period)||7,1),90);
 const q=await pool.query(`SELECT metric,round(avg(value),2) AS avg, min(value) AS min,max(value) AS max,count(*)::int AS count FROM health_measurements WHERE patient_id=$1 AND measured_at>=CASE WHEN $2=1 THEN date_trunc('day',now()) ELSE now()-($2::text||' days')::interval END GROUP BY metric ORDER BY metric`,[req.user.id,days]);
 const h=await pool.query(`SELECT metric,value,unit,measured_at FROM health_measurements WHERE patient_id=$1 AND measured_at>=CASE WHEN $2=1 THEN date_trunc('day',now()) ELSE now()-($2::text||' days')::interval END ORDER BY measured_at`,[req.user.id,days]);res.json({summary:q.rows,history:h.rows,period:days});
}));
app.get('/api/doctors',auth,asyncRoute(async(req,res)=>{const q=await pool.query('SELECT d.id,d.user_id,d.full_name,d.experience_years,d.bio,s.name AS specialty,c.name AS clinic FROM doctors d LEFT JOIN specialties s ON s.id=d.specialty_id LEFT JOIN clinics c ON c.id=d.clinic_id ORDER BY d.full_name');res.json(q.rows);}));
app.get('/api/clinics',auth,asyncRoute(async(req,res)=>{const q=await pool.query('SELECT * FROM clinics ORDER BY name');res.json(q.rows);}));
app.get('/api/slots',auth,asyncRoute(async(req,res)=>{
 const doctor=Number(req.query.doctor_id);if(!doctor)return res.status(400).json({error:'Не выбран врач'});
 const q=await pool.query(`SELECT id,starts_at FROM doctor_schedules WHERE doctor_id=$1 AND is_booked=false AND starts_at>now() ORDER BY starts_at LIMIT 60`,[doctor]);res.json(q.rows);
}));
app.get('/api/appointments',auth,asyncRoute(async(req,res)=>{
 let q;if(req.user.role==='patient')q=await pool.query(`SELECT a.*,d.full_name AS doctor,s.name AS specialty,c.name AS clinic FROM appointments a JOIN doctors d ON d.id=a.doctor_id LEFT JOIN specialties s ON s.id=d.specialty_id LEFT JOIN clinics c ON c.id=d.clinic_id WHERE a.patient_id=$1 ORDER BY starts_at DESC`,[req.user.id]);
 else if(req.user.role==='doctor')q=await pool.query(`SELECT a.*,u.full_name AS patient,d.id AS doctor_id FROM appointments a JOIN doctors d ON d.user_id=$1 JOIN users u ON u.id=a.patient_id WHERE a.doctor_id=d.id ORDER BY starts_at DESC`,[req.user.id]);
 else q=await pool.query(`SELECT a.*,u.full_name AS patient,d.full_name AS doctor FROM appointments a JOIN users u ON u.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id ORDER BY starts_at DESC LIMIT 200`);res.json(q.rows);
}));
app.post('/api/appointments',auth,asyncRoute(async(req,res)=>{
 if(!requirePatient(req,res))return;const doctor=Number(req.body.doctor_id),slot=Number(req.body.slot_id),reason=String(req.body.reason||'').slice(0,500);
 const client=await pool.connect();try{await client.query('BEGIN');
 let startsAt=req.body.starts_at;
 if(slot){const sq=await client.query('SELECT starts_at FROM doctor_schedules WHERE id=$1 AND doctor_id=$2 AND is_booked=false AND starts_at>now() FOR UPDATE',[slot,doctor]);if(!sq.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Это время уже недоступно'});}startsAt=sq.rows[0].starts_at;}
 if(!doctor||!startsAt){await client.query('ROLLBACK');return res.status(400).json({error:'Выберите врача и время'});}
 const conflict=await client.query("SELECT id FROM appointments WHERE doctor_id=$1 AND starts_at=$2 AND status<>'Отменена' FOR UPDATE",[doctor,startsAt]);if(conflict.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Это время уже занято'});}
 const q=await client.query("INSERT INTO appointments(patient_id,doctor_id,starts_at,reason,status) VALUES($1,$2,$3,$4,'Запланирована') RETURNING *",[req.user.id,doctor,startsAt,reason]);if(slot)await client.query('UPDATE doctor_schedules SET is_booked=true WHERE id=$1',[slot]);await client.query('COMMIT');await notify(req.user.id,'Запись создана','Визит успешно запланирован.','appointment',{type:'appointment',id:q.rows[0].id});await audit(req.user.id,'create','appointments',q.rows[0].id);res.status(201).json(q.rows[0]);
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.patch('/api/appointments/:id',auth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 let current;if(req.user.role==='patient')current=await client.query('SELECT * FROM appointments WHERE id=$1 AND patient_id=$2 AND starts_at>now() FOR UPDATE',[req.params.id,req.user.id]);
 else if(req.user.role==='doctor')current=await client.query('SELECT a.* FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.id=$1 AND d.user_id=$2 FOR UPDATE OF a',[req.params.id,req.user.id]);
 else {await client.query('ROLLBACK');return res.status(403).json({error:'Недостаточно прав'});}
 if(!current.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Запись не найдена или недоступна'});}
 const ap=current.rows[0];let startsAt=ap.starts_at;
 if(req.body.slot_id){if(req.user.role!=='patient'){await client.query('ROLLBACK');return res.status(403).json({error:'Перенос доступен пациенту'});}const slot=await client.query('SELECT starts_at FROM doctor_schedules WHERE id=$1 AND doctor_id=$2 AND is_booked=false AND starts_at>now() FOR UPDATE',[req.body.slot_id,ap.doctor_id]);if(!slot.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Новое время уже недоступно'});}startsAt=slot.rows[0].starts_at;await client.query('UPDATE doctor_schedules SET is_booked=false WHERE doctor_id=$1 AND starts_at=$2',[ap.doctor_id,ap.starts_at]);await client.query('UPDATE doctor_schedules SET is_booked=true WHERE id=$1',[req.body.slot_id]);}
 const status=req.body.status?String(req.body.status):ap.status;if(!['Запланирована','Подтверждена','Завершена','Отменена'].includes(status)){await client.query('ROLLBACK');return res.status(400).json({error:'Недопустимый статус'});}if(req.user.role==='patient'&&status!=='Отменена'&&status!==ap.status){await client.query('ROLLBACK');return res.status(403).json({error:'Пациент может отменить запись, но не менять её служебный статус'});}
 const q=await client.query('UPDATE appointments SET starts_at=$1,status=$2,updated_at=now() WHERE id=$3 RETURNING *',[startsAt,status,ap.id]);if(status==='Отменена')await client.query('UPDATE doctor_schedules SET is_booked=false WHERE doctor_id=$1 AND starts_at=$2',[ap.doctor_id,ap.starts_at]);await client.query('COMMIT');await audit(req.user.id,'update','appointments',ap.id);if(req.body.slot_id)await notify(ap.patient_id,'Время визита изменено','Дата и время записи были перенесены.','appointment',{type:'appointment',id:ap.id});res.json(q.rows[0]);
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.get('/api/labs',auth,asyncRoute(async(req,res)=>{if(req.user.role!=='patient')return res.json([]);const q=await pool.query('SELECT t.*,c.name AS clinic FROM lab_tests t LEFT JOIN clinics c ON c.id=t.clinic_id WHERE t.patient_id=$1 ORDER BY conducted_at DESC',[req.user.id]);res.json(q.rows);}));
app.get('/api/labs/:id',auth,asyncRoute(async(req,res)=>{if(req.user.role!=='patient')return res.status(403).json({error:'Недостаточно прав'});const q=await pool.query('SELECT t.*,c.name AS clinic FROM lab_tests t LEFT JOIN clinics c ON c.id=t.clinic_id WHERE t.id=$1 AND t.patient_id=$2',[req.params.id,req.user.id]);if(!q.rowCount)return res.status(404).json({error:'Анализ не найден'});const [r,docs]=await Promise.all([pool.query('SELECT * FROM lab_test_results WHERE test_id=$1 ORDER BY id',[req.params.id]),pool.query('SELECT id,file_name FROM lab_documents WHERE test_id=$1 ORDER BY created_at DESC',[req.params.id])]);res.json({...q.rows[0],results:r.rows,documents:docs.rows});}));
app.get('/api/access-grants',auth,roles('patient'),asyncRoute(async(req,res)=>{const q=await pool.query(`SELECT g.id,g.granted_at,d.id AS doctor_id,u.full_name,s.name AS specialty FROM access_grants g JOIN users u ON u.id=g.doctor_id LEFT JOIN doctors d ON d.user_id=u.id LEFT JOIN specialties s ON s.id=d.specialty_id WHERE g.patient_id=$1 AND g.revoked_at IS NULL ORDER BY g.granted_at DESC`,[req.user.id]);res.json(q.rows);}));
app.post('/api/access-grants',auth,roles('patient'),asyncRoute(async(req,res)=>{const doctorId=Number(req.body.doctor_id);const d=await pool.query('SELECT user_id FROM doctors WHERE id=$1 AND user_id IS NOT NULL',[doctorId]);if(!d.rowCount)return res.status(404).json({error:'Врач не найден'});const q=await pool.query(`INSERT INTO access_grants(patient_id,doctor_id,revoked_at) VALUES($1,$2,NULL) ON CONFLICT(patient_id,doctor_id) DO UPDATE SET revoked_at=NULL,granted_at=now() RETURNING *`,[req.user.id,d.rows[0].user_id]);await audit(req.user.id,'grant','access_grants',q.rows[0].id);res.status(201).json(q.rows[0]);}));
app.delete('/api/access-grants/:id',auth,roles('patient'),asyncRoute(async(req,res)=>{const q=await pool.query('UPDATE access_grants SET revoked_at=now() WHERE id=$1 AND patient_id=$2 AND revoked_at IS NULL RETURNING id',[req.params.id,req.user.id]);if(!q.rowCount)return res.status(404).json({error:'Разрешение не найдено'});await audit(req.user.id,'revoke','access_grants',Number(req.params.id));res.json({ok:true});}));
app.get('/api/doctor/patients/:id/measurements',auth,roles('doctor'),asyncRoute(async(req,res)=>{const grant=await pool.query('SELECT 1 FROM access_grants WHERE patient_id=$1 AND doctor_id=$2 AND revoked_at IS NULL',[req.params.id,req.user.id]);if(!grant.rowCount)return res.status(403).json({error:'Нет разрешения пациента'});const q=await pool.query('SELECT id,metric,value,unit,measured_at,source,comment FROM health_measurements WHERE patient_id=$1 ORDER BY measured_at DESC LIMIT 300',[req.params.id]);res.json(q.rows);}));
app.get('/api/doctor/patients',auth,roles('doctor'),asyncRoute(async(req,res)=>{const q=await pool.query(`SELECT DISTINCT u.id,u.full_name FROM access_grants g JOIN users u ON u.id=g.patient_id WHERE g.doctor_id=$1 AND g.revoked_at IS NULL ORDER BY u.full_name`,[req.user.id]);res.json(q.rows);}));
app.post('/api/doctor/records',auth,roles('doctor'),asyncRoute(async(req,res)=>{const patient=Number(req.body.patient_id),category=String(req.body.category||'Заключения врачей'),title=String(req.body.title||'').trim(),description=String(req.body.description||'').slice(0,3000);if(!patient||title.length<3)return res.status(400).json({error:'Укажите пациента и заголовок заключения'});const grant=await pool.query('SELECT 1 FROM access_grants WHERE patient_id=$1 AND doctor_id=$2 AND revoked_at IS NULL',[patient,req.user.id]);if(!grant.rowCount)return res.status(403).json({error:'У пациента нет действующего разрешения на доступ'});const d=await pool.query('SELECT full_name FROM users WHERE id=$1',[req.user.id]);const q=await pool.query('INSERT INTO medical_records(patient_id,category,title,description,author) VALUES($1,$2,$3,$4,$5) RETURNING *',[patient,category,title,description,d.rows[0].full_name]);await notify(patient,'Новое заключение врача',title,'record',{type:'record',id:q.rows[0].id});await audit(req.user.id,'create','medical_records',q.rows[0].id);res.status(201).json(q.rows[0]);}));
app.post('/api/labs/:id/documents',auth,upload.single('document'),asyncRoute(async(req,res)=>{if(req.user.role!=='patient'){if(req.file)await unlink(req.file.path).catch(()=>{});return res.status(403).json({error:'Загрузка доступна пациенту'});}if(!req.file)return res.status(400).json({error:'Выберите файл'});const test=await pool.query('SELECT id FROM lab_tests WHERE id=$1 AND patient_id=$2',[req.params.id,req.user.id]);if(!test.rowCount){await unlink(req.file.path).catch(()=>{});return res.status(404).json({error:'Анализ не найден'});}const q=await pool.query('INSERT INTO lab_documents(test_id,file_name,mime_type,file_size,storage_key) VALUES($1,$2,$3,$4,$5) RETURNING id,file_name,mime_type,file_size,created_at',[req.params.id,req.file.originalname,req.file.mimetype,req.file.size,req.file.filename]);await audit(req.user.id,'upload','lab_documents',q.rows[0].id);res.status(201).json(q.rows[0]);}));
app.get('/api/lab-documents/:id',auth,asyncRoute(async(req,res)=>{if(req.user.role!=='patient')return res.status(403).json({error:'Недостаточно прав'});const q=await pool.query('SELECT ld.*,t.patient_id FROM lab_documents ld JOIN lab_tests t ON t.id=ld.test_id WHERE ld.id=$1 AND t.patient_id=$2',[req.params.id,req.user.id]);if(!q.rowCount)return res.status(404).json({error:'Документ не найден'});res.download(path.join(UPLOAD_DIR,path.basename(q.rows[0].storage_key)),q.rows[0].file_name);}));
app.get('/api/records',auth,asyncRoute(async(req,res)=>{let q;if(req.user.role==='patient')q=await pool.query(`SELECT r.*,count(md.id)::int AS document_count,coalesce(json_agg(json_build_object('id',md.id,'file_name',md.file_name)) FILTER(WHERE md.id IS NOT NULL),'[]') AS documents FROM medical_records r LEFT JOIN medical_documents md ON md.record_id=r.id WHERE r.patient_id=$1 GROUP BY r.id ORDER BY r.created_at DESC`,[req.user.id]);else if(req.user.role==='doctor')q=await pool.query(`SELECT r.*,count(md.id)::int AS document_count,coalesce(json_agg(json_build_object('id',md.id,'file_name',md.file_name)) FILTER(WHERE md.id IS NOT NULL),'[]') AS documents FROM medical_records r JOIN access_grants g ON g.patient_id=r.patient_id LEFT JOIN medical_documents md ON md.record_id=r.id WHERE g.doctor_id=$1 AND g.revoked_at IS NULL GROUP BY r.id ORDER BY r.created_at DESC`,[req.user.id]);else return res.json([]);res.json(q.rows);}));
app.post('/api/records/:id/documents',auth,upload.single('document'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'Выберите файл'});const record=await pool.query('SELECT id,patient_id FROM medical_records WHERE id=$1',[req.params.id]);if(!record.rowCount){await unlink(req.file.path).catch(()=>{});return res.status(404).json({error:'Запись не найдена'});}let allowed=req.user.role==='patient'&&record.rows[0].patient_id===req.user.id;if(req.user.role==='doctor'){const g=await pool.query('SELECT 1 FROM access_grants WHERE patient_id=$1 AND doctor_id=$2 AND revoked_at IS NULL',[record.rows[0].patient_id,req.user.id]);allowed=!!g.rowCount;}if(!allowed){await unlink(req.file.path).catch(()=>{});return res.status(403).json({error:'Нет разрешения на загрузку документа'});}const q=await pool.query('INSERT INTO medical_documents(record_id,file_name,mime_type,file_size,storage_key) VALUES($1,$2,$3,$4,$5) RETURNING id,file_name,mime_type,file_size,created_at',[req.params.id,req.file.originalname,req.file.mimetype,req.file.size,req.file.filename]);await audit(req.user.id,'upload','medical_documents',q.rows[0].id);res.status(201).json(q.rows[0]);}));
app.get('/api/documents/:id',auth,asyncRoute(async(req,res)=>{const q=await pool.query('SELECT md.*,r.patient_id FROM medical_documents md JOIN medical_records r ON r.id=md.record_id WHERE md.id=$1',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Документ не найден'});const d=q.rows[0];let allowed=req.user.role==='patient'&&d.patient_id===req.user.id;if(req.user.role==='doctor'){const g=await pool.query('SELECT 1 FROM access_grants WHERE patient_id=$1 AND doctor_id=$2 AND revoked_at IS NULL',[d.patient_id,req.user.id]);allowed=!!g.rowCount;}if(!allowed)return res.status(403).json({error:'Нет доступа к документу'});const safe=path.basename(d.storage_key);const file=path.join(UPLOAD_DIR,safe);res.download(file,d.file_name);}));
app.get('/api/recommendations',auth,asyncRoute(async(req,res)=>{if(req.user.role!=='patient')return res.json([]);const q=await pool.query('SELECT * FROM recommendations WHERE patient_id=$1 ORDER BY created_at DESC',[req.user.id]);res.json(q.rows);}));
app.patch('/api/recommendations/:id',auth,asyncRoute(async(req,res)=>{if(!requirePatient(req,res))return;const status=String(req.body.status||'');if(!['Новая','Выполнена','Отложена','Скрыта'].includes(status))return res.status(400).json({error:'Недопустимый статус'});const q=await pool.query('UPDATE recommendations SET status=$1,updated_at=now() WHERE id=$2 AND patient_id=$3 RETURNING *',[status,req.params.id,req.user.id]);if(!q.rowCount)return res.status(404).json({error:'Рекомендация не найдена'});res.json(q.rows[0]);}));
app.get('/api/notifications',auth,asyncRoute(async(req,res)=>{const q=await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]);res.json(q.rows);}));
app.patch('/api/notifications/:id/read',auth,asyncRoute(async(req,res)=>{const q=await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2 RETURNING *',[req.params.id,req.user.id]);if(!q.rowCount)return res.status(404).json({error:'Уведомление не найдено'});res.json(q.rows[0]);}));
app.get('/api/ai/messages',auth,asyncRoute(async(req,res)=>{const q=await pool.query('SELECT role,content,created_at FROM ai_messages WHERE user_id=$1 ORDER BY created_at',[req.user.id]);res.json(q.rows);}));
app.post('/api/ai/chat',auth,asyncRoute(async(req,res)=>{
 const question=String(req.body.message||'').trim();if(!question)return res.status(400).json({error:'Введите вопрос'});if(question.length>2000)return res.status(400).json({error:'Сообщение слишком длинное'});
 const lower=question.toLowerCase();let answer='Я могу помочь с общей справочной информацией о здоровье. Для индивидуальной оценки обратитесь к врачу. Я не ставлю диагнозы и не назначаю лечение.';
 if(/анализ|гемоглобин|холестерин|витамин/.test(lower))answer='Результаты лабораторных исследований интерпретируют с учётом референсных интервалов конкретной лаборатории, симптомов и анамнеза. Отдельное значение само по себе не устанавливает диагноз. Обсудите отклонения с лечащим врачом; при желании укажите показатель и его референсный диапазон — я объясню общие термины.';
 else if(/сон|бессон/.test(lower))answer='Для гигиены сна полезны регулярное время отхода ко сну, спокойный вечерний ритуал, комфортная тёмная спальня и ограничение кофеина во второй половине дня. При стойких нарушениях сна обсудите ситуацию с врачом.';
 else if(/серд|упраж|нагруз/.test(lower))answer='Физическую активность обычно увеличивают постепенно, выбирая нагрузку по самочувствию и рекомендациям специалиста. При боли или сдавлении в груди, выраженной одышке, обмороке или внезапной слабости обратитесь за неотложной медицинской помощью.';
 else if(/вода|питан/.test(lower))answer='Потребности в жидкости и питании индивидуальны и зависят от возраста, активности, климата и состояния здоровья. Универсальная норма подходит не всем; при ограничениях по жидкости или специальной диете следуйте рекомендациям врача.';
 await pool.query("INSERT INTO ai_messages(user_id,role,content) VALUES($1,'user',$2),($1,'assistant',$3)",[req.user.id,question,answer]);res.json({answer,disclaimer:'Информационный ответ учебного ассистента. Не является диагнозом или назначением лечения.'});
}));
app.get('/api/report.csv',auth,asyncRoute(async(req,res)=>{if(req.user.role!=='patient')return res.status(403).json({error:'Отчёт доступен пациенту'});const days=Math.min(Math.max(Number(req.query.period)||30,1),365);const [m,l,a,u]=await Promise.all([pool.query(`SELECT metric,value,unit,measured_at,source FROM health_measurements WHERE patient_id=$1 AND measured_at>=now()-($2::text||' days')::interval ORDER BY measured_at`,[req.user.id,days]),pool.query('SELECT name,status,conducted_at FROM lab_tests WHERE patient_id=$1 AND conducted_at>=CURRENT_DATE-$2 ORDER BY conducted_at',[req.user.id,days]),pool.query(`SELECT a.starts_at,a.status,d.full_name AS doctor,s.name AS specialty FROM appointments a JOIN doctors d ON d.id=a.doctor_id LEFT JOIN specialties s ON s.id=d.specialty_id WHERE a.patient_id=$1 AND a.starts_at>=now()-($2::text||' days')::interval ORDER BY a.starts_at`,[req.user.id,days]),pool.query('SELECT full_name FROM users WHERE id=$1',[req.user.id])]);const escape=v=>'"'+String(v??'').replaceAll('"','""')+'"';const rows=[['HealthHub AI — отчёт о здоровье'],['Пациент',u.rows[0]?.full_name||''],['Период, дней',days],[],['Тип','Название','Значение','Единица','Дата','Источник / статус / детали'],...m.rows.map(x=>['Измерение',x.metric,x.value,x.unit,x.measured_at.toISOString(),x.source]),...l.rows.map(x=>['Анализ',x.name,'','',x.conducted_at?.toISOString?.()||x.conducted_at,x.status]),...a.rows.map(x=>['Визит',x.specialty||'Приём',x.doctor,'',x.starts_at.toISOString(),x.status])].map(row=>row.map(escape).join(','));res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="healthhub-report.csv"');res.send('\uFEFF'+rows.join('\r\n'));}));
app.get('/api/admin/users',auth,roles('admin'),asyncRoute(async(req,res)=>{const q=await pool.query('SELECT id,full_name,email,role,is_active,created_at FROM users ORDER BY created_at DESC');res.json(q.rows);}));
app.patch('/api/admin/users/:id',auth,roles('admin'),asyncRoute(async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id===req.user.id)return res.status(400).json({error:'Нельзя изменить эту учётную запись'});const fields=[],values=[];if(typeof req.body.is_active==='boolean'){values.push(req.body.is_active);fields.push(`is_active=$${values.length}`);}if(req.body.role){if(!['patient','doctor','admin'].includes(req.body.role))return res.status(400).json({error:'Недопустимая роль'});values.push(req.body.role);fields.push(`role=$${values.length}`);}if(!fields.length)return res.status(400).json({error:'Нет полей для изменения'});values.push(id);const q=await pool.query(`UPDATE users SET ${fields.join(',')} WHERE id=$${values.length} RETURNING id,full_name,email,role,is_active,created_at`,values);if(!q.rowCount)return res.status(404).json({error:'Пользователь не найден'});await audit(req.user.id,'update','users',id);res.json(q.rows[0]);}));
app.post('/api/admin/clinics',auth,roles('admin'),asyncRoute(async(req,res)=>{const name=String(req.body.name||'').trim(),address=String(req.body.address||'').trim();if(name.length<2||address.length<3)return res.status(400).json({error:'Укажите название и адрес клиники'});const q=await pool.query('INSERT INTO clinics(name,address,phone,working_hours,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[name,address,req.body.phone||null,req.body.working_hours||null,req.body.latitude??null,req.body.longitude??null]);res.status(201).json(q.rows[0]);}));
app.patch('/api/admin/clinics/:id',auth,roles('admin'),asyncRoute(async(req,res)=>{const q=await pool.query('UPDATE clinics SET name=COALESCE($1,name),address=COALESCE($2,address),phone=COALESCE($3,phone),working_hours=COALESCE($4,working_hours) WHERE id=$5 RETURNING *',[req.body.name||null,req.body.address||null,req.body.phone||null,req.body.working_hours||null,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Клиника не найдена'});res.json(q.rows[0]);}));
app.use((err,req,res,next)=>{console.error(err);if(err instanceof multer.MulterError)return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'Файл превышает лимит 5 МБ':err.message});if(err.message==='Разрешены только PDF, PNG и JPEG')return res.status(400).json({error:err.message});res.status(500).json({
  error: process.env.NODE_ENV === 'production'
    ? 'Внутренняя ошибка сервера. Проверьте журнал API.'
    : `Ошибка сервера: ${err.message || 'неизвестная ошибка'}`
});});
async function initializeDatabase(){
  const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
  const seed=await readFile(new URL('../seed.sql',import.meta.url),'utf8');
  await pool.query(schema);
  await pool.query(seed);
  console.log('Database schema checked and demo data seeded.');
}
try {
  await initializeDatabase();
  app.listen(PORT,()=>console.log(`HealthHub API listening on http://localhost:${PORT}`));
} catch (error) {
  console.error('\nНе удалось запустить API HealthHub AI.');
  console.error('Проверьте, что PostgreSQL запущен, база healthhub создана, а DATABASE_URL в server/.env указан верно.');
  console.error('Подробности ошибки PostgreSQL/инициализации:', error);
  process.exitCode = 1;
  await pool.end().catch(()=>{});
}

async function hashPassword(password){const salt=crypto.randomBytes(16);const key=await scrypt(password,salt,64);return `scrypt$${salt.toString('hex')}$${Buffer.from(key).toString('hex')}`;}
async function verifyPassword(password,stored){try{const [kind,saltHex,keyHex]=stored.split('$');if(kind!=='scrypt')return false;const expected=Buffer.from(keyHex,'hex');const actual=Buffer.from(await scrypt(password,Buffer.from(saltHex,'hex'),expected.length));return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}catch{return false;}}
