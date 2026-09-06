import type { Locale } from '@/lib/i18n/I18nProvider';

export type AuthCopy = {
  common: {
    tagline: string;
    brandPromise: string;
    language: string;
    secure: string;
    legalPrefix: string;
    terms: string;
    privacy: string;
    backToLogin: string;
    loading: string;
    networkError: string;
    showPassword: string;
    hidePassword: string;
  };
  welcome: {
    eyebrow: string;
    title: string;
    accent: string;
    body: string;
    primary: string;
    secondary: string;
    speed: string;
    local: string;
    reliable: string;
  };
  login: {
    eyebrow: string;
    title: string;
    subtitle: string;
    email: string;
    password: string;
    remember: string;
    forgot: string;
    submit: string;
    noAccount: string;
    register: string;
    divider: string;
    invalid: string;
    verified: string;
    reset: string;
  };
  register: {
    eyebrow: string;
    title: string;
    subtitle: string;
    name: string;
    phone: string;
    optional: string;
    confirm: string;
    submit: string;
    haveAccount: string;
    required: string;
    invalidEmail: string;
    weakPassword: string;
    mismatch: string;
    failed: string;
    success: string;
  };
  forgot: {
    eyebrow: string;
    title: string;
    subtitle: string;
    submit: string;
    success: string;
    successBody: string;
    required: string;
    invalidEmail: string;
    failed: string;
  };
  reset: {
    eyebrow: string;
    title: string;
    subtitle: string;
    password: string;
    confirm: string;
    submit: string;
    success: string;
    successBody: string;
    invalid: string;
    expired: string;
    used: string;
    required: string;
    weak: string;
    mismatch: string;
  };
  verify: {
    eyebrow: string;
    title: string;
    subtitle: string;
    label: string;
    submit: string;
    resend: string;
    resendIn: string;
    noCode: string;
    wrong: string;
    expired: string;
    success: string;
    successBody: string;
    changeEmail: string;
  };
};

export const AUTH_COPY: Record<Locale, AuthCopy> = {
  de: {
    common: {
      tagline: 'Schnell. Zuverlässig. Für dich.',
      brandPromise: 'Dein Essen. Sicher unterwegs. Direkt bei dir.',
      language: 'Sprache',
      secure: 'Geschützte Anmeldung',
      legalPrefix: 'Mit der Nutzung stimmst du unseren',
      terms: 'AGB',
      privacy: 'Datenschutzhinweisen',
      backToLogin: 'Zurück zur Anmeldung',
      loading: 'Bitte warten…',
      networkError: 'Verbindung fehlgeschlagen. Bitte versuche es erneut.',
      showPassword: 'Passwort anzeigen',
      hidePassword: 'Passwort ausblenden',
    },
    welcome: {
      eyebrow: 'Willkommen bei BlinkGo',
      title: 'Was du liebst,',
      accent: 'kommt direkt zu dir.',
      body: 'Entdecke Restaurants in deiner Nähe, bestelle unkompliziert und verfolge deine Lieferung in Echtzeit.',
      primary: 'Konto erstellen',
      secondary: 'Anmelden',
      speed: 'Schnell bestellt',
      local: 'Lokal entdeckt',
      reliable: 'Zuverlässig geliefert',
    },
    login: {
      eyebrow: 'Schön, dass du wieder da bist',
      title: 'Anmelden',
      subtitle: 'Greife sicher auf deine Bestellungen und Lieferungen zu.',
      email: 'E-Mail-Adresse',
      password: 'Passwort',
      remember: 'Angemeldet bleiben',
      forgot: 'Passwort vergessen?',
      submit: 'Jetzt anmelden',
      noAccount: 'Noch kein Konto?',
      register: 'Konto erstellen',
      divider: 'oder weiter mit',
      invalid: 'E-Mail oder Passwort ist nicht korrekt.',
      verified: 'Deine E-Mail wurde bestätigt. Du kannst dich jetzt anmelden.',
      reset: 'Dein Passwort wurde aktualisiert. Melde dich mit dem neuen Passwort an.',
    },
    register: {
      eyebrow: 'In wenigen Schritten startklar',
      title: 'Konto erstellen',
      subtitle: 'Erstelle dein persönliches BlinkGo-Konto.',
      name: 'Vor- und Nachname',
      phone: 'Telefonnummer',
      optional: 'optional',
      confirm: 'Passwort bestätigen',
      submit: 'Konto erstellen',
      haveAccount: 'Du hast bereits ein Konto?',
      required: 'Bitte fülle alle Pflichtfelder aus.',
      invalidEmail: 'Bitte gib eine gültige E-Mail-Adresse ein.',
      weakPassword: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
      mismatch: 'Die Passwörter stimmen nicht überein.',
      failed: 'Das Konto konnte nicht erstellt werden.',
      success: 'Konto erstellt. Weiter zur E-Mail-Bestätigung…',
    },
    forgot: {
      eyebrow: 'Zugang wiederherstellen',
      title: 'Passwort vergessen?',
      subtitle: 'Gib deine E-Mail-Adresse ein. Wir senden dir einen sicheren Link zum Zurücksetzen.',
      submit: 'Reset-Link senden',
      success: 'Prüfe dein Postfach',
      successBody: 'Wenn ein Konto für diese E-Mail existiert, haben wir einen Link gesendet. Prüfe bitte auch den Spam-Ordner.',
      required: 'Bitte gib deine E-Mail-Adresse ein.',
      invalidEmail: 'Bitte gib eine gültige E-Mail-Adresse ein.',
      failed: 'Der Reset-Link konnte nicht gesendet werden.',
    },
    reset: {
      eyebrow: 'Konto schützen',
      title: 'Neues Passwort setzen',
      subtitle: 'Wähle ein neues Passwort mit mindestens 8 Zeichen.',
      password: 'Neues Passwort',
      confirm: 'Passwort bestätigen',
      submit: 'Passwort speichern',
      success: 'Passwort aktualisiert',
      successBody: 'Du wirst gleich zur Anmeldung weitergeleitet.',
      invalid: 'Der Reset-Link ist ungültig.',
      expired: 'Der Reset-Link ist abgelaufen. Fordere bitte einen neuen an.',
      used: 'Dieser Reset-Link wurde bereits verwendet.',
      required: 'Bitte fülle beide Passwortfelder aus.',
      weak: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
      mismatch: 'Die Passwörter stimmen nicht überein.',
    },
    verify: {
      eyebrow: 'Nur noch ein Schritt',
      title: 'E-Mail bestätigen',
      subtitle: 'Wir haben einen sechsstelligen Code an deine E-Mail-Adresse gesendet.',
      label: 'Bestätigungscode',
      submit: 'E-Mail bestätigen',
      resend: 'Neuen Code senden',
      resendIn: 'Erneut senden in {n}s',
      noCode: 'Keinen Code erhalten? Prüfe bitte auch deinen Spam-Ordner.',
      wrong: 'Der Code ist nicht korrekt. Bitte versuche es erneut.',
      expired: 'Der Code ist abgelaufen. Fordere einen neuen an.',
      success: 'E-Mail bestätigt',
      successBody: 'Du kannst dich jetzt sicher anmelden.',
      changeEmail: 'E-Mail-Adresse ändern',
    },
  },
  ar: {
    common: {
      tagline: 'سريع. موثوق. لأجلك.',
      brandPromise: 'طعامك في الطريق إليك بأمان وسرعة.',
      language: 'اللغة',
      secure: 'تسجيل دخول آمن',
      legalPrefix: 'باستخدامك للخدمة فإنك توافق على',
      terms: 'الشروط',
      privacy: 'سياسة الخصوصية',
      backToLogin: 'العودة إلى تسجيل الدخول',
      loading: 'يرجى الانتظار…',
      networkError: 'تعذر الاتصال. حاول مرة أخرى.',
      showPassword: 'إظهار كلمة المرور',
      hidePassword: 'إخفاء كلمة المرور',
    },
    welcome: {
      eyebrow: 'مرحبًا بك في BlinkGo',
      title: 'كل ما تحبه،',
      accent: 'يصل مباشرة إليك.',
      body: 'اكتشف المطاعم القريبة، اطلب بسهولة، وتابع توصيل طلبك لحظة بلحظة.',
      primary: 'إنشاء حساب',
      secondary: 'تسجيل الدخول',
      speed: 'طلب سريع',
      local: 'خيارات محلية',
      reliable: 'توصيل موثوق',
    },
    login: {
      eyebrow: 'سعداء بعودتك',
      title: 'تسجيل الدخول',
      subtitle: 'ادخل بأمان إلى طلباتك وعمليات التوصيل.',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      remember: 'تذكرني',
      forgot: 'نسيت كلمة المرور؟',
      submit: 'تسجيل الدخول',
      noAccount: 'ليس لديك حساب؟',
      register: 'إنشاء حساب',
      divider: 'أو المتابعة عبر',
      invalid: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      verified: 'تم تأكيد بريدك. يمكنك تسجيل الدخول الآن.',
      reset: 'تم تحديث كلمة المرور. استخدم كلمة المرور الجديدة للدخول.',
    },
    register: {
      eyebrow: 'ابدأ خلال خطوات قليلة',
      title: 'إنشاء حساب',
      subtitle: 'أنشئ حسابك الشخصي في BlinkGo.',
      name: 'الاسم الكامل',
      phone: 'رقم الهاتف',
      optional: 'اختياري',
      confirm: 'تأكيد كلمة المرور',
      submit: 'إنشاء الحساب',
      haveAccount: 'لديك حساب بالفعل؟',
      required: 'يرجى ملء جميع الحقول المطلوبة.',
      invalidEmail: 'يرجى إدخال بريد إلكتروني صالح.',
      weakPassword: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',
      mismatch: 'كلمتا المرور غير متطابقتين.',
      failed: 'تعذر إنشاء الحساب.',
      success: 'تم إنشاء الحساب. ننتقل إلى تأكيد البريد…',
    },
    forgot: {
      eyebrow: 'استعادة الوصول',
      title: 'نسيت كلمة المرور؟',
      subtitle: 'أدخل بريدك وسنرسل رابطًا آمنًا لإعادة تعيين كلمة المرور.',
      submit: 'إرسال رابط الاستعادة',
      success: 'تحقق من بريدك',
      successBody: 'إذا كان هناك حساب بهذا البريد فقد أرسلنا رابطًا. تحقق أيضًا من مجلد الرسائل غير المرغوبة.',
      required: 'يرجى إدخال البريد الإلكتروني.',
      invalidEmail: 'يرجى إدخال بريد إلكتروني صالح.',
      failed: 'تعذر إرسال رابط الاستعادة.',
    },
    reset: {
      eyebrow: 'حماية الحساب',
      title: 'تعيين كلمة مرور جديدة',
      subtitle: 'اختر كلمة مرور جديدة من 8 أحرف على الأقل.',
      password: 'كلمة المرور الجديدة',
      confirm: 'تأكيد كلمة المرور',
      submit: 'حفظ كلمة المرور',
      success: 'تم تحديث كلمة المرور',
      successBody: 'سيتم توجيهك إلى تسجيل الدخول.',
      invalid: 'رابط إعادة التعيين غير صالح.',
      expired: 'انتهت صلاحية الرابط. اطلب رابطًا جديدًا.',
      used: 'تم استخدام هذا الرابط من قبل.',
      required: 'يرجى ملء حقلي كلمة المرور.',
      weak: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',
      mismatch: 'كلمتا المرور غير متطابقتين.',
    },
    verify: {
      eyebrow: 'بقيت خطوة واحدة',
      title: 'تأكيد البريد الإلكتروني',
      subtitle: 'أرسلنا رمزًا من ستة أرقام إلى بريدك الإلكتروني.',
      label: 'رمز التأكيد',
      submit: 'تأكيد البريد',
      resend: 'إرسال رمز جديد',
      resendIn: 'إعادة الإرسال خلال {n}ث',
      noCode: 'لم يصلك الرمز؟ تحقق أيضًا من مجلد الرسائل غير المرغوبة.',
      wrong: 'الرمز غير صحيح. حاول مرة أخرى.',
      expired: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.',
      success: 'تم تأكيد البريد',
      successBody: 'يمكنك الآن تسجيل الدخول بأمان.',
      changeEmail: 'تغيير البريد الإلكتروني',
    },
  },
  en: {
    common: {
      tagline: 'Fast. Reliable. For you.',
      brandPromise: 'Your food, safely on its way and straight to you.',
      language: 'Language',
      secure: 'Secure sign-in',
      legalPrefix: 'By using BlinkGo you agree to our',
      terms: 'Terms',
      privacy: 'Privacy Policy',
      backToLogin: 'Back to sign in',
      loading: 'Please wait…',
      networkError: 'Connection failed. Please try again.',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
    },
    welcome: {
      eyebrow: 'Welcome to BlinkGo',
      title: 'What you love,',
      accent: 'delivered straight to you.',
      body: 'Discover nearby restaurants, order with ease, and follow every step of your delivery.',
      primary: 'Create account',
      secondary: 'Sign in',
      speed: 'Order quickly',
      local: 'Discover locally',
      reliable: 'Delivered reliably',
    },
    login: {
      eyebrow: 'Good to have you back',
      title: 'Sign in',
      subtitle: 'Securely access your orders and deliveries.',
      email: 'Email address',
      password: 'Password',
      remember: 'Keep me signed in',
      forgot: 'Forgot password?',
      submit: 'Sign in',
      noAccount: 'New to BlinkGo?',
      register: 'Create account',
      divider: 'or continue with',
      invalid: 'Email or password is incorrect.',
      verified: 'Your email is verified. You can sign in now.',
      reset: 'Your password was updated. Sign in with your new password.',
    },
    register: {
      eyebrow: 'Ready in a few steps',
      title: 'Create account',
      subtitle: 'Create your personal BlinkGo account.',
      name: 'Full name',
      phone: 'Phone number',
      optional: 'optional',
      confirm: 'Confirm password',
      submit: 'Create account',
      haveAccount: 'Already have an account?',
      required: 'Please complete all required fields.',
      invalidEmail: 'Please enter a valid email address.',
      weakPassword: 'Password must be at least 8 characters.',
      mismatch: 'Passwords do not match.',
      failed: 'The account could not be created.',
      success: 'Account created. Taking you to email verification…',
    },
    forgot: {
      eyebrow: 'Restore access',
      title: 'Forgot your password?',
      subtitle: 'Enter your email and we will send you a secure reset link.',
      submit: 'Send reset link',
      success: 'Check your inbox',
      successBody: 'If an account exists for this email, we sent a link. Please check your spam folder too.',
      required: 'Please enter your email address.',
      invalidEmail: 'Please enter a valid email address.',
      failed: 'The reset link could not be sent.',
    },
    reset: {
      eyebrow: 'Protect your account',
      title: 'Set a new password',
      subtitle: 'Choose a new password with at least 8 characters.',
      password: 'New password',
      confirm: 'Confirm password',
      submit: 'Save password',
      success: 'Password updated',
      successBody: 'You will be redirected to sign in.',
      invalid: 'The reset link is invalid.',
      expired: 'The reset link has expired. Please request another.',
      used: 'This reset link has already been used.',
      required: 'Please complete both password fields.',
      weak: 'Password must be at least 8 characters.',
      mismatch: 'Passwords do not match.',
    },
    verify: {
      eyebrow: 'One last step',
      title: 'Verify your email',
      subtitle: 'We sent a six-digit code to your email address.',
      label: 'Verification code',
      submit: 'Verify email',
      resend: 'Send a new code',
      resendIn: 'Resend in {n}s',
      noCode: 'No code yet? Please check your spam folder too.',
      wrong: 'That code is not correct. Please try again.',
      expired: 'The code has expired. Request a new one.',
      success: 'Email verified',
      successBody: 'You can now sign in securely.',
      changeEmail: 'Change email address',
    },
  },
};
