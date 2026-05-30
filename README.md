# QuateCalc — אוטומציה של הצעות מחיר לקבלני בנייה ושיפוצים

פלטפורמת ווב (עברית/RTL) שבה קבלן מזין רשימת חומרי גלם חופשית, המערכת **מושכת
אוטומטית** מחירים עדכניים מספק מקוון, מתאימה כל שורה למוצר בקטלוג, ומפיקה הצעת מחיר
עם סכומי שורות, הוצאות נוספות, שורת רווח ומע"מ — לייצוא ל-Excel/CSV.

> הליבה היא **איסוף מחירים אוטומטי** (scraping) שבונה ומרענן קטלוג בעצמו — בלי
> תחזוקת מחירון ידנית.

## ארכיטקטורה (monorepo, TypeScript מקצה-לקצה)

```
packages/
  contracts/        Zod schemas + types משותפים (הגבול בין כל החבילות)
  db/               Prisma (Postgres) — קטלוג, הצעות, ריצות סריקה + repositories
  units/            נרמול טקסט עברי + פירוק/המרת יחידות
  matching/         התאמת טקסט חופשי -> מוצר בקטלוג (pg_trgm + token overlap)
  pricing/          חישוב טהור: סכומים, הוצאות, רווח, מע"מ
  export/           ייצוא Excel (RTL) + CSV (BOM)
  scraper-core/     framework לסריקה: registry, rate-limit, robots, cache, runner
  scraper-adapters/ אדפטר לכל ספק (ACE) + fixtures
apps/
  web/              Next.js 15 — אשף 4 שלבים (RTL עברית) + API
  worker/           job לרענון קטלוג (runner + adapter); מצב fixtures/live
```

**זרימת המשתמש:** הזנת חומרים → סקירת התאמות (עריכה + למידת תיקונים) → הגדרת
הוצאות/רווח/מע"מ → הצעת מחיר + הורדת Excel/CSV.

**עיקרון מפתח — staging→promote:** ריצת סריקה כותבת שורות כ-`staged`; רק ריצה
תקינה (שעברה health-gate) מקודמת ל-`current` והישנות עוברות ל-`archived`, כך
שסריקה שבורה לעולם לא מוחקת קטלוג תקין.

## הרצה מקומית

```bash
# 1. תשתית: Postgres + Redis
docker compose up -d            # או Postgres מקומי על localhost:5432
cp .env.example .env

# 2. תלויות
pnpm install

# 3. מסד נתונים
pnpm --filter @quatecalc/db generate
pnpm --filter @quatecalc/db migrate     # מיגרציות + pg_trgm + GIN index
pnpm seed                                # קטלוג חומרי בנייה לדוגמה (אזור מרכז)

# 4. רענון קטלוג (אוטומציית המחירים)
pnpm --filter @quatecalc/worker refresh -- --fixtures --region center   # offline
# pnpm --filter @quatecalc/worker refresh -- --live --region center      # אתר אמיתי

# 5. אפליקציית הווב
pnpm --filter @quatecalc/web dev         # http://localhost:3000
```

## אימות (tests)

```bash
pnpm -r typecheck     # כל החבילות
pnpm -r test          # unit + integration
```

החבילות הטהורות (units, pricing, export, scraper-*) נבדקות offline; matching כולל
בדיקת אינטגרציה מול ה-DB המוזרע; worker כולל e2e הרמטי של מסלול הסריקה.

## הערות

- **חוקיות סריקה:** ה-runner מכבד `robots.txt`, מגביל קצב, ומזדהה ב-User-Agent.
  סריקת ספק חדש דורשת בדיקת תנאי שימוש. ה-adapter pattern מאפשר החלפת ספק בקלות.
- **מע"מ:** ברירת מחדל 18% (ישראל, 2026), ניתן לשינוי לכל הצעה.
- **תחום:** בנייה/שיפוצים, ספק ראשון ACE (לדוגמה). הרחבה לספקים נוספים = adapter חדש.
