-- HealthHub AI schema. Safe to run repeatedly on PostgreSQL 14+.
CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('patient','doctor','admin')) DEFAULT 'patient',
 is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS patient_profiles (id BIGSERIAL PRIMARY KEY,user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,birth_date DATE,phone TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS clinics (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL,latitude DOUBLE PRECISION,longitude DOUBLE PRECISION,phone TEXT,working_hours TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS specialties (id BIGSERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS doctors (id BIGSERIAL PRIMARY KEY,user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,full_name TEXT NOT NULL,specialty_id BIGINT REFERENCES specialties(id),experience_years INT NOT NULL DEFAULT 0 CHECK(experience_years>=0),clinic_id BIGINT REFERENCES clinics(id),bio TEXT,photo_url TEXT);
CREATE TABLE IF NOT EXISTS doctor_schedules (id BIGSERIAL PRIMARY KEY,doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,starts_at TIMESTAMPTZ NOT NULL,is_booked BOOLEAN NOT NULL DEFAULT false,UNIQUE(doctor_id,starts_at));
CREATE UNIQUE INDEX IF NOT EXISTS doctor_schedules_doctor_slot_idx ON doctor_schedules(doctor_id,starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS doctors_user_id_unique_idx ON doctors(user_id);
CREATE TABLE IF NOT EXISTS appointments (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id),doctor_id BIGINT NOT NULL REFERENCES doctors(id),starts_at TIMESTAMPTZ NOT NULL,reason TEXT,status TEXT NOT NULL DEFAULT 'Запланирована' CHECK(status IN ('Запланирована','Подтверждена','Завершена','Отменена')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS appointments_patient_date_idx ON appointments(patient_id,starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_active_idx ON appointments(doctor_id,starts_at) WHERE status<>'Отменена';
CREATE TABLE IF NOT EXISTS health_metrics (id BIGSERIAL PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,unit TEXT NOT NULL,min_value NUMERIC,max_value NUMERIC);
INSERT INTO health_metrics(code,name,unit,min_value,max_value) VALUES ('pulse','Пульс','уд/мин',25,240),('spo2','SpO₂','%',50,100),('temperature','Температура','°C',30,45),('steps','Шаги','шагов',0,100000),('sleep','Сон','ч',0,24) ON CONFLICT(code) DO NOTHING;
CREATE TABLE IF NOT EXISTS health_measurements (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,metric TEXT NOT NULL,value NUMERIC NOT NULL,unit TEXT NOT NULL,measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),source TEXT NOT NULL DEFAULT 'Вручную',comment TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE health_measurements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS health_measurements_patient_metric_date_idx ON health_measurements(patient_id,metric,measured_at DESC);
CREATE TABLE IF NOT EXISTS lab_tests (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,conducted_at DATE,status TEXT NOT NULL DEFAULT 'Готов' CHECK(status IN ('Назначен','В обработке','Готов')),clinic_id BIGINT REFERENCES clinics(id),attachment_name TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS lab_test_results (id BIGSERIAL PRIMARY KEY,test_id BIGINT NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,name TEXT NOT NULL,value NUMERIC,unit TEXT,reference_min NUMERIC,reference_max NUMERIC);
CREATE TABLE IF NOT EXISTS medical_records (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,category TEXT NOT NULL,title TEXT NOT NULL,description TEXT,author TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lab_documents (id BIGSERIAL PRIMARY KEY,test_id BIGINT NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,file_size BIGINT NOT NULL,storage_key TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS medical_documents (id BIGSERIAL PRIMARY KEY,record_id BIGINT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,file_size BIGINT NOT NULL,storage_key TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS vaccinations (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,administered_at DATE,provider TEXT,notes TEXT);
CREATE TABLE IF NOT EXISTS allergies (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,substance TEXT NOT NULL,reaction TEXT,severity TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS chronic_conditions (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,diagnosed_at DATE,notes TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS recommendations (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,category TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,basis TEXT,status TEXT NOT NULL DEFAULT 'Новая' CHECK(status IN ('Новая','Выполнена','Отложена','Скрыта')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS notifications (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT,kind TEXT,related_type TEXT,related_id BIGINT,is_read BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_conversations (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT,consent_to_store BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_messages (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,conversation_id BIGINT REFERENCES ai_conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS conversation_id BIGINT;
CREATE TABLE IF NOT EXISTS access_grants (id BIGSERIAL PRIMARY KEY,patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,doctor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),revoked_at TIMESTAMPTZ,UNIQUE(patient_id,doctor_id));
CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY,actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,entity TEXT,entity_id BIGINT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
