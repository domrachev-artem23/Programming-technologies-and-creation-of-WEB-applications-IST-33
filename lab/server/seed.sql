-- All records below are fictional demo data. Demo password for all accounts: demo1234
INSERT INTO users(full_name,email,password_hash,role) VALUES
('Иванова Анна','anna@example.test','scrypt$4865616c746848756244656d6f53616c7432303236$2eb4026c098611db10f9d7940ce55ed888b1d9739cbe29fc4c9f56bf0a07496c7b4365bf6cf09cb3c88c97f02f83298874c11e9d49dcad8808794f895433c8e9','patient'),
('Смирнов Алексей','doctor@example.test','scrypt$4865616c746848756244656d6f53616c7432303236$2eb4026c098611db10f9d7940ce55ed888b1d9739cbe29fc4c9f56bf0a07496c7b4365bf6cf09cb3c88c97f02f83298874c11e9d49dcad8808794f895433c8e9','doctor'),
('Администратор HealthHub','admin@example.test','scrypt$4865616c746848756244656d6f53616c7432303236$2eb4026c098611db10f9d7940ce55ed888b1d9739cbe29fc4c9f56bf0a07496c7b4365bf6cf09cb3c88c97f02f83298874c11e9d49dcad8808794f895433c8e9','admin')
ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,is_active=true;
INSERT INTO patient_profiles(user_id,birth_date,phone) SELECT id,'1992-04-12','+41 00 000 00 00' FROM users WHERE email='anna@example.test' ON CONFLICT(user_id) DO NOTHING;
INSERT INTO clinics(name,address,latitude,longitude,phone,working_hours) SELECT 'Клиника Здоровье','ул. Лесная, 24',47.3769,8.5417,'+41 44 000 00 00','Пн–Пт 08:00–18:00' WHERE NOT EXISTS(SELECT 1 FROM clinics WHERE name='Клиника Здоровье');
INSERT INTO specialties(name) VALUES('Терапевт'),('Кардиолог'),('Эндокринолог') ON CONFLICT DO NOTHING;
INSERT INTO doctors(user_id,full_name,specialty_id,experience_years,clinic_id,bio)
SELECT u.id,u.full_name,s.id,12,c.id,'Врач общей практики. Демонстрационный профиль.' FROM users u CROSS JOIN specialties s CROSS JOIN clinics c WHERE u.email='doctor@example.test' AND s.name='Терапевт' AND c.name='Клиника Здоровье' ON CONFLICT(user_id) DO NOTHING;
INSERT INTO doctors(full_name,specialty_id,experience_years,clinic_id,bio)
SELECT 'Петрова Мария',s.id,8,c.id,'Кардиолог. Демонстрационный профиль.' FROM specialties s CROSS JOIN clinics c WHERE s.name='Кардиолог' AND c.name='Клиника Здоровье' AND NOT EXISTS(SELECT 1 FROM doctors WHERE full_name='Петрова Мария');
INSERT INTO doctors(full_name,specialty_id,experience_years,clinic_id,bio)
SELECT 'Сидоров Иван',s.id,15,c.id,'Эндокринолог. Демонстрационный профиль.' FROM specialties s CROSS JOIN clinics c WHERE s.name='Эндокринолог' AND c.name='Клиника Здоровье' AND NOT EXISTS(SELECT 1 FROM doctors WHERE full_name='Сидоров Иван');
INSERT INTO doctor_schedules(doctor_id,starts_at)
SELECT d.id, (CURRENT_DATE + gs.day_no + time '09:00' + (gs2.slot_no*interval '30 minutes')) AT TIME ZONE 'Europe/Zurich'
FROM doctors d CROSS JOIN generate_series(1,14) AS gs(day_no) CROSS JOIN generate_series(0,9) AS gs2(slot_no)
WHERE extract(isodow from CURRENT_DATE + gs.day_no) BETWEEN 1 AND 5
ON CONFLICT(doctor_id,starts_at) DO NOTHING;
INSERT INTO access_grants(patient_id,doctor_id)
SELECT p.id,d.user_id FROM users p CROSS JOIN doctors d WHERE p.email='anna@example.test' AND d.user_id IS NOT NULL
ON CONFLICT(patient_id,doctor_id) DO NOTHING;
INSERT INTO appointments(patient_id,doctor_id,starts_at,reason,status)
SELECT p.id,d.id,s.starts_at,'Плановая консультация','Подтверждена' FROM users p CROSS JOIN doctors d CROSS JOIN LATERAL (SELECT starts_at FROM doctor_schedules WHERE doctor_id=d.id AND is_booked=false AND starts_at>now() ORDER BY starts_at LIMIT 1) s
WHERE p.email='anna@example.test' AND d.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM appointments WHERE patient_id=p.id AND doctor_id=d.id);
UPDATE doctor_schedules ds SET is_booked=true FROM appointments a WHERE a.doctor_id=ds.doctor_id AND a.starts_at=ds.starts_at AND a.patient_id=(SELECT id FROM users WHERE email='anna@example.test');
INSERT INTO health_measurements(patient_id,metric,value,unit,measured_at,source)
SELECT u.id,x.metric,x.val,x.unit,now()-(x.days||' days')::interval,'Демо-устройство'
FROM users u CROSS JOIN (VALUES
('Пульс',72,'уд/мин',0),('SpO₂',98,'%',0),('Температура',36.6,'°C',0),('Шаги',8432,'шагов',0),('Сон',7.5,'ч',0),
('Пульс',75,'уд/мин',1),('SpO₂',97,'%',1),('Температура',36.5,'°C',1),('Шаги',7900,'шагов',1),('Сон',7.0,'ч',1),
('Пульс',70,'уд/мин',2),('SpO₂',98,'%',2),('Температура',36.7,'°C',2),('Шаги',9100,'шагов',2),('Сон',8.0,'ч',2),
('Пульс',74,'уд/мин',3),('SpO₂',97,'%',3),('Температура',36.6,'°C',3),('Шаги',7200,'шагов',3),('Сон',6.8,'ч',3),
('Пульс',71,'уд/мин',4),('SpO₂',98,'%',4),('Температура',36.5,'°C',4),('Шаги',10020,'шагов',4),('Сон',7.8,'ч',4),
('Пульс',73,'уд/мин',5),('SpO₂',98,'%',5),('Температура',36.6,'°C',5),('Шаги',8400,'шагов',5),('Сон',7.2,'ч',5),
('Пульс',72,'уд/мин',6),('SpO₂',98,'%',6),('Температура',36.6,'°C',6),('Шаги',8432,'шагов',6),('Сон',7.4,'ч',6)
) AS x(metric,val,unit,days) WHERE u.email='anna@example.test' AND NOT EXISTS(SELECT 1 FROM health_measurements WHERE patient_id=u.id);
INSERT INTO lab_tests(patient_id,name,conducted_at,status,clinic_id)
SELECT u.id,x.name,CURRENT_DATE-x.days,x.status,c.id FROM users u CROSS JOIN clinics c CROSS JOIN (VALUES ('Общий анализ крови',2,'Готов'),('Биохимический анализ крови',4,'Готов'),('Витамин D',8,'Готов'),('Гормоны щитовидной железы',12,'В обработке')) x(name,days,status) WHERE u.email='anna@example.test' AND NOT EXISTS(SELECT 1 FROM lab_tests WHERE patient_id=u.id AND name=x.name);
INSERT INTO lab_test_results(test_id,name,value,unit,reference_min,reference_max)
SELECT t.id,x.name,x.val,x.unit,x.lo,x.hi FROM lab_tests t CROSS JOIN (VALUES ('Гемоглобин',132,'г/л',120,160),('Лейкоциты',6.1,'10⁹/л',4,9),('Эритроциты',4.5,'10¹²/л',3.8,5.2)) x(name,val,unit,lo,hi) WHERE t.name='Общий анализ крови' AND NOT EXISTS(SELECT 1 FROM lab_test_results WHERE test_id=t.id);
INSERT INTO medical_records(patient_id,category,title,description,author)
SELECT u.id,x.category,x.title,x.description,x.author FROM users u CROSS JOIN (VALUES ('Заключения врачей','Консультация терапевта','Плановый осмотр. Демонстрационная запись.','Смирнов Алексей'),('Вакцинация','Вакцинация — демонстрационная запись','Пример записи о вакцинации.','Медицинский центр'),('Аллергии','Аллергии не указаны','В профиле нет зарегистрированных аллергий.','Пациент')) x(category,title,description,author) WHERE u.email='anna@example.test' AND NOT EXISTS(SELECT 1 FROM medical_records WHERE patient_id=u.id AND title=x.title);
INSERT INTO recommendations(patient_id,category,title,description,basis)
SELECT u.id,x.category,x.title,x.description,x.basis FROM users u CROSS JOIN (VALUES ('Активность','Добавьте регулярные прогулки','Попробуйте распределять физическую активность на короткие комфортные интервалы.','Демонстрационный пример на основе записей шагов.'),('Сон','Поддерживайте регулярный режим сна','Старайтесь ложиться и вставать примерно в одно время.','Общая рекомендация по гигиене сна.'),('Исследования','Проверяйте готовность анализов','Откройте раздел анализов, чтобы проверить статусы исследований.','Напоминание по демонстрационным данным.')) x(category,title,description,basis) WHERE u.email='anna@example.test' AND NOT EXISTS(SELECT 1 FROM recommendations WHERE patient_id=u.id AND title=x.title);
INSERT INTO notifications(user_id,title,body,kind) SELECT id,'Добро пожаловать в HealthHub AI','Это учебное уведомление. Все данные вымышлены.','info' FROM users WHERE email='anna@example.test' AND NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=users.id AND title='Добро пожаловать в HealthHub AI');
