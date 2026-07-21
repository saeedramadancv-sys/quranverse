# بناء تطبيق أندرويد (APK) — QuranVerse

المشروع مُجهّز بالكامل باستخدام **Capacitor**. الكود الأصلي للتطبيق موجود في
`www/` (نفس ملفات الموقع)، ومشروع أندرويد جاهز في `android/`.

يبقى فقط بناء ملف الـ APK — وهذا يحتاج أدوات على جهازك.

---

## المتطلّبات (مرّة واحدة)

1. **Android Studio** — نزّليه من: https://developer.android.com/studio
   - أثناء التثبيت، اتركي خيارات "Android SDK" و"Android SDK Platform"
     و"Android Virtual Device" مفعّلة.
   - Android Studio يأتي معه **JDK مدمج** — لذلك لا تحتاجين ضبط Java يدوياً
     (نسخة Java 26 المثبّتة عندك حديثة جداً على Gradle، والحلّ هو استخدام
     الـ JDK المدمج في Android Studio كما بالأسفل).

2. **Node.js** — مثبّت لديك بالفعل ✅

---

## الطريقة الأسهل: عبر Android Studio (موصى بها)

```bash
# 1) داخل مجلد المشروع، زامني آخر تغييرات الموقع إلى مشروع أندرويد
cd E:\app
npx cap sync android

# 2) افتحي مشروع أندرويد في Android Studio
npx cap open android
```

ثم داخل Android Studio:

1. انتظري حتى ينتهي **Gradle Sync** (شريط سفلي — أول مرة قد يستغرق دقائق
   لأنه ينزّل مكوّنات SDK).
2. من القائمة العلوية: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. عند الانتهاء تظهر رسالة "APK(s) generated" — اضغطي **locate** لفتح المجلد.
   الملف يكون في:
   ```
   android\app\build\outputs\apk\debug\app-debug.apk
   ```
4. انقلي `app-debug.apk` إلى هاتفك وثبّتيه (فعّلي "تثبيت من مصادر غير معروفة").

> لو ظهر خطأ متعلّق بإصدار Java: في Android Studio افتحي
> **File → Settings → Build, Execution, Deployment → Build Tools → Gradle**،
> واضبطي **Gradle JDK** على النسخة المدمجة (Embedded JDK / jbr-17 أو jbr-21).

---

## الطريقة البديلة: سطر الأوامر

تحتاج ضبط مسار الـ SDK ووجود JDK 17 أو 21 (وليس 26).

```bash
# أنشئي ملف android/local.properties يحوي مسار الـ SDK، مثال:
#   sdk.dir=C:\\Users\\<اسمك>\\AppData\\Local\\Android\\Sdk

cd E:\app\android
gradlew.bat assembleDebug
# الناتج: app\build\outputs\apk\debug\app-debug.apk
```

---

## ملاحظات مهمة للتشغيل على الهاتف

- **الميكروفون:** التطبيق يطلب إذن الميكروفون أول مرة — اسمحي به ليعمل
  الإملاء الصوتي والتسجيل. (الإذن معرّف مسبقاً في `AndroidManifest.xml`.)

- **الاتصال بالباك-إند:** على الهاتف، كلمة `localhost` تشير إلى الهاتف نفسه —
  ليست جهاز الكمبيوتر. من شاشة **⚙ الإعدادات** داخل التطبيق، غيّري عنوان
  الباك-إند إلى **عنوان الـ IP المحلي لجهاز الشريك** على نفس الشبكة، مثال:
  `http://192.168.1.20:8000/api`. (نقل الـ HTTP غير المشفّر مسموح — مضبوط في
  `capacitor.config.json`.)

- **التعرّف الصوتي على أندرويد:** يستخدم مكوّن أندرويد الأصلي
  (`@capacitor-community/speech-recognition`) لأن WebView لا يدعم Web Speech
  API. قد يحتاج الجهاز تثبيت خدمة التعرّف من Google. يُنصح باختباره على جهاز
  حقيقي.

---

## تحديث التطبيق بعد أي تعديل على الموقع

كل ما عليك بعد تعديل ملفات `www/`:

```bash
npx cap sync android    # أو شغّلي  sync-app.bat
```

ثم أعيدي البناء من Android Studio.

---

## تغيير أيقونة/اسم التطبيق (اختياري)

- الاسم: عدّلي `android/app/src/main/res/values/strings.xml` (`app_name`).
- الأيقونة: أسهل طريقة هي حزمة `@capacitor/assets` — ضعي صورة
  `assets/icon.png` (1024×1024) ثم:
  ```bash
  npm install -D @capacitor/assets
  npx capacitor-assets generate --android
  ```
