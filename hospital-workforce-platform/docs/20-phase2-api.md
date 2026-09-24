# API فاز ۲

تمام مسیرها زیر `/api/v1` و پس از احراز هویت JWT هستند.

| مسیر | کاربرد |
|---|---|
| `POST /shifts`، `GET /shifts`، `GET /shifts/:id`، `PUT /shifts/:id`، `DELETE /shifts/:id` | چرخه عمر شیفت |
| `POST /shifts/:id/assign`، `GET /shifts/:id/assignments`، `DELETE /assignments/:id` | تخصیص نیرو |
| `POST /shifts/:id/validate` | اجرای قوانین اعتبار مدرک، تداخل، دسترسی و مهارت |
| `GET /shifts/:id/candidates` | فهرست کاندیداهای رتبه‌بندی‌شده برای فاز ۳ |
| `GET /shift-templates`، `POST /shift-templates` | الگوهای قابل استفاده مجدد |
| `GET /employees/:id/availability`، `POST /availability`، `GET /availability` | دسترسی و مرخصی |
| `GET /supervisor/dashboard`، `GET /coverage/dashboard` | KPI، کمبود نیرو، درصد پوشش و تاییدهای معوق |

پاسخ validation همیشه شامل `valid`، آرایه `errors` فارسی، `warnings` و جزئیات هر قانون است.
