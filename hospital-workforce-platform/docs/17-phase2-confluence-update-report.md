# سند Confluence: معماری فاز ۲

## دامنه
مدیریت بخش، الگوی شیفت، نمونه شیفت، دسترسی کارکنان، تخصیص نیرو، تایید سرپرستار و داشبورد پوشش.

## جریان کاری
`پیش‌نویس ← در انتظار تایید ← تایید شده ← فعال ← تکمیل شده`

تخصیص نیرو نیز از `پیشنهاد شده` و `در انتظار تایید پرسنل` به `تایید و قطعی شده` می‌رسد. هر تخصیص پیش از ثبت از چهار قانون اعتبار مدرک، تداخل زمانی، دسترسی و مهارت عبور می‌کند.

## پیاده‌سازی
جداول در schema `shift` و audit در `platform.audit_log` و `shift.audit_logs` قرار دارند. API در `docs/05-api-documentation.md` و جزئیات معماری در `docs/13-phase2-architecture.md` است. رابط کاربری `fa-IR`، راست‌به‌چپ و تقویم جلالی است.

## نمودار ER
`departments 1—N shift_templates 1—N shift_instances 1—N shift_assignments N—1 employees`؛ `employees 1—N employee_availability`.
