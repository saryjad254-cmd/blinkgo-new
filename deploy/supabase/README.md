# Supabase Migrations — دليل التشغيل

> ترتيب التشغيل مهم جدًا. كل ملف يعتمد على ما سبقه.

## الترتيب الصحيح

```bash
# 1. الـ Schema الأساسي (الملف الأصلي)
psql "$DATABASE_URL" -f ../../attachments/fafcbe44__d385b5ad-88d0-4b0f-b306-aba2a88d2336.sql

# أو من Supabase SQL Editor: الصق كامل المحتوى وشغّل

# 2. مزامنة Auth (الأهم — بدونه التطبيق لن يعمل)
psql "$DATABASE_URL" -f 00-auth-sync.sql

# 3. إصلاح سياسات RLS
psql "$DATABASE_URL" -f 01-rls-fixes.sql

# 4. Triggers للتجميع التلقائي
psql "$DATABASE_URL" -f 02-aggregations.sql

# 5. دوال مساعدة (RPC)
psql "$DATABASE_URL" -f 03-helpers.sql
```

## أو عبر السكريبت الآلي

```bash
./scripts/db-migrate.sh --url "$SUPABASE_URL" --key "$SUPABASE_SERVICE_ROLE_KEY"
```

## التحقق بعد التشغيل

```sql
-- عدد الجداول (يجب 15)
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- عدد السياسات (يجب 25+)
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';

-- Triggers المضافة
SELECT trigger_name, event_object_table FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table;
```

## ملاحظات

- **`SECURITY DEFINER`**: جميع الدوال في `03-helpers.sql` و Trigger functions في `00-auth-sync.sql` تستخدمه. هذا آمن لأنه يحد من سطح الهجوم.
- **`auth_role()`**: يُرجع `'anon'` للمستخدم غير المسجّل، وليس NULL — هذا يبسّط سياسات RLS.
- **PostGIS**: للحصول على أداء أفضل في `find_nearby_drivers`، فعّل extension:
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE INDEX idx_driver_status_geo ON driver_status USING gist (
    ll_to_earth(latitude::float, longitude::float)
  );
  ```