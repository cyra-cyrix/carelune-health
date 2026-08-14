-- ============================================================================
-- Carelune — pilot seed (run AFTER 0001_carelune_core.sql).
--
-- Creates: one pilot centre, assigns every existing account to it (single-
-- centre pilot), and one SYNTHETIC test patient with a full care plan, meds,
-- 7 days of readings, feed and approvals — so the app has data before real
-- patients are enrolled through onboarding.
--
-- Idempotent: safe to run more than once.
--
-- Prereq: create the 6 demo accounts first (Supabase Auth), so profiles exist:
--   Authentication -> Users -> Add user (or sign-up in the app), then set each
--   user's role in user_metadata (patient|caregiver|family|nurse|duty_doctor|pmr).
-- ============================================================================

-- 1. Pilot centre (single row; reused on re-run).
insert into centres (id, name)
values ('00000000-0000-0000-0000-0000000000c1', 'Pilot Rehab Centre')
on conflict (id) do nothing;

-- 1b. Backfill profiles for accounts that existed BEFORE the signup trigger
--     (the trigger only fires on new signups). Role comes from user_metadata.
insert into profiles (id, role, full_name)
select u.id,
       coalesce((u.raw_user_meta_data->>'role')::app_role, 'patient'),
       u.raw_user_meta_data->>'full_name'
from auth.users u
on conflict (id) do nothing;

-- 2. Single-centre pilot: put every account in the pilot centre.
update profiles
set centre_id = '00000000-0000-0000-0000-0000000000c1'
where centre_id is null;

-- 3. Synthetic test patient (fixed id for idempotency). FICTIONAL.
insert into patients (id, centre_id, full_name, age, sex, location, discharged_on,
                      journey_start, journey_total_days, diagnosis, status)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c1',
  'Sarita Kulkarni', 46, 'F', 'Home · Kumaraswamy Layout, Bengaluru',
  current_date - 6, current_date - 6, 90,
  array[
    'Cerebral venous thrombosis — parietal haemorrhage',
    'Post right decompressive craniectomy · tetraplegia, improving',
    'Tracheostomy — decannulated; thickened oral feeds',
    'Paroxysmal sympathetic hyperactivity with dystonia — settling',
    'Hypertension; bronchial asthma'
  ],
  'active'
)
on conflict (id) do nothing;

-- 4. Link household accounts (patient/caregiver/family) to the test patient.
--    Single test patient in the pilot, so map each household role to it.
insert into patient_members (patient_id, user_id, relation)
select '00000000-0000-0000-0000-0000000000a1', p.id,
       case p.role when 'patient' then 'self'::member_relation
                   when 'caregiver' then 'caregiver'::member_relation
                   else 'family'::member_relation end
from profiles p
where p.role in ('patient','caregiver','family')
on conflict (patient_id, user_id) do nothing;

-- 5. Consent record (fictional grant).
insert into consents (patient_id, subject_name, relation_to_patient, consent_version)
select '00000000-0000-0000-0000-0000000000a1', 'Suresh Kulkarni', 'son', 'v1'
where not exists (
  select 1 from consents where patient_id = '00000000-0000-0000-0000-0000000000a1'
);

-- 6. Medications (only if none yet for this patient).
insert into medications (patient_id, name, dose, freq, timing, note)
select '00000000-0000-0000-0000-0000000000a1', m.name, m.dose, m.freq, m.timing, m.note
from (values
  ('Rivaroxaban','20 mg','1-0-0','After food','Till review'),
  ('Brivaracetam','75 mg','1-0-1','After food',null),
  ('Amantadine','100 mg','0-1-0','After food',null),
  ('Sacubitril + Valsartan','50 mg','1-0-1','After food',null),
  ('Bisoprolol','5 mg','1-0-0','After food',null),
  ('Clonidine','0.1 mg','1-1-1','After food','For dystonia/PSH'),
  ('Torasemide + Spironolactone','10/25 mg','1-0-0','After food',null),
  ('Metformin','500 mg','1-0-1','Before food',null),
  ('Pantoprazole','40 mg','1-0-0','Before food',null),
  ('Pacitane','2 mg','½-0-½','After food',null),
  ('Melatonin','3 mg','0-0-1','At night',null)
) as m(name,dose,freq,timing,note)
where not exists (
  select 1 from medications where patient_id = '00000000-0000-0000-0000-0000000000a1'
);

-- 7. Care plan tasks (only if none yet).
insert into care_tasks (patient_id, time_label, sort_order, discipline, title, detail)
select '00000000-0000-0000-0000-0000000000a1', t.time_label, t.ord, t.discipline, t.title, t.detail
from (values
  ('07:00',1,'Medicine','Morning medicines','With breakfast'),
  ('07:30',2,'Feeding','Breakfast — thickened, upright 90°','Small spoons; watch swallow'),
  ('08:30',3,'Physiotherapy','Limb PROM + stretching','20 minutes'),
  ('09:00',4,'Physiotherapy','CPM stimulation','As set on the device'),
  ('10:00',5,'Nursing','Repositioning + skin check','2-hourly'),
  ('11:00',6,'Respiratory','Nebulization','Chest physiotherapy after'),
  ('12:00',7,'Occupational','Wheelchair sitting','30 minutes, out of bed'),
  ('12:30',8,'Feeding','Lunch — thickened, upright 90°','Watch swallow'),
  ('14:00',9,'Nursing','Repositioning + skin check','2-hourly'),
  ('16:00',10,'Speech & Swallow','Oromotor exercises','Before evening feed'),
  ('19:00',11,'Medicine','Evening medicines','After dinner')
) as t(time_label,ord,discipline,title,detail)
where not exists (
  select 1 from care_tasks where patient_id = '00000000-0000-0000-0000-0000000000a1'
);

-- 8. Seven days of readings — an improving trend (only if none yet).
insert into daily_readings (patient_id, reading_date, bp, grbs, urine_ml, food_intake, mood, activity)
select '00000000-0000-0000-0000-0000000000a1',
       current_date - d.n,
       d.bp, d.grbs, d.urine, d.food, d.mood, d.activity
from (values
  (6,'148/92','172','1300','Some','😐 Flat','Bed rest'),
  (5,'144/90','165','1350','Some','😐 Flat','Sat up 10 min'),
  (4,'140/88','150','1380','Most','🙂 Calm','Wheelchair 15 min'),
  (3,'138/86','148','1400','Most','🙂 Calm','Wheelchair 20 min'),
  (2,'134/84','140','1420','Most','🙂 Calm','Wheelchair 25 min'),
  (1,'130/82','136','1440','Most','🙂 Calm','Wheelchair 30 min'),
  (0,'128/82','132','1450','Most','🙂 Calm','Wheelchair 30 min')
) as d(n,bp,grbs,urine,food,mood,activity)
where not exists (
  select 1 from daily_readings where patient_id = '00000000-0000-0000-0000-0000000000a1'
);

-- 9. Care feed + approvals (only if none yet).
insert into daily_updates (patient_id, source, author_name, body, flag)
select '00000000-0000-0000-0000-0000000000a1', s.source::update_source, s.author, s.body, s.flag
from (values
  ('caregiver','Lakshmi','Morning medicines + nebulization given.','info'),
  ('duty_doctor','Dr. Farhan','Vitals stable, BP improving. Medicine suggestion raised for approval.','info'),
  ('caregiver','Lakshmi','CPM + limb stretching done. Repositioned (2-hourly).','info'),
  ('nurse','Nisha','Swallow reviewed — stronger today; kept thickened. Flagged to PMR.','watch'),
  ('caregiver','Lakshmi','Wheelchair sitting 30 min tolerated. Lunch ~90%.','info')
) as s(source,author,body,flag)
where not exists (
  select 1 from daily_updates where patient_id = '00000000-0000-0000-0000-0000000000a1'
);

insert into approvals (patient_id, type, from_name, message, suggestion, urgency)
select '00000000-0000-0000-0000-0000000000a1', a.type::approval_type, a.from_name, a.message, a.suggestion, a.urgency::urgency
from (values
  ('duty_med','Dr. Farhan · Duty Doctor','BP has trended down all week on dual diuretic; sodium 140.','Reduce Torasemide + Spironolactone to alternate days','routine'),
  ('nurse_query','Nisha · Nurse','Swallow looks stronger today — family asking to start thin liquids. Hold for your call?',null,'urgent'),
  ('patient_query','Family · Sarita''s son','Can we increase her wheelchair sitting time?',null,'routine')
) as a(type,from_name,message,suggestion,urgency)
where not exists (
  select 1 from approvals where patient_id = '00000000-0000-0000-0000-0000000000a1'
);

-- ============================================================================
-- Done. The app now has one fully-populated synthetic patient. Verify:
--   select full_name, status from patients;
--   select reading_date, bp, grbs from daily_readings order by reading_date;
-- ============================================================================
