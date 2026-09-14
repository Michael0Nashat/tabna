<script>
  import { goto } from '$app/navigation';
  import {
    Search,
    CalendarDays,
    MessageCircle,
    Phone,
    Video,
    ShieldCheck,
    Wallet,
    Star,
    Clock3,
    UserRound,
    Stethoscope,
    FileText,
    ArrowLeft,
    CheckCircle2,
    Lock,
    X,
    Menu,
    Upload,
    GraduationCap,
    CreditCard,
    Camera,
    MapPin,
    Fingerprint,
    Smartphone,
    Mail
  } from 'lucide-svelte';

  // ---------------- Mobile nav ----------------
  let mobileMenuOpen = $state(false);

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  // ---------------- Doctor registration modal ----------------

  let showDoctorModal = $state(false);
  let step = $state(1); // 1 = بيانات التسجيل الأولي, 2 = رفع المستندات
  let submitted = $state(false);
  let submitting = $state(false);

  let form = $state({
    fullName: '',
    phone: '',
    email: '',
    nationalId: '',
    syndicateNumber: '',
    birthDate: '',
    specialty: '',
    degree: '',
    governorate: ''
  });

  /** @type {{syndicateCard: File | null, idCard: File | null, specialtyCertificate: File | null, personalPhoto: File | null}} */
  let files = $state({
    syndicateCard: null,
    idCard: null,
    specialtyCertificate: null,
    personalPhoto: null
  });

  /**
   * Safely get file by key
   * @param {string} key
   * @returns {File | null}
   */
  function getFile(key) {
    return files[key];
  }

  /**
   * Safely set file by key
   * @param {string} key
   * @param {File | null} value
   */
  function setFile(key, value) {
    files = { ...files, [key]: value };
  }

  const degrees = ['ممارس', 'أخصائي', 'استشاري'];

  const governorates = [
    'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'أسيوط', 'الشرقية',
    'الغربية', 'المنوفية', 'القليوبية', 'أسوان', 'الأقصر', 'بورسعيد',
    'السويس', 'الإسماعيلية', 'دمياط', 'كفر الشيخ', 'البحيرة', 'المنيا',
    'بني سويف', 'الفيوم', 'سوهاج', 'قنا', 'البحر الأحمر', 'الوادي الجديد',
    'مطروح', 'شمال سيناء', 'جنوب سيناء'
  ];

  /** @type {Array<{key: 'syndicateCard' | 'idCard' | 'specialtyCertificate' | 'personalPhoto', label: string, hint: string, icon: string, required: boolean}>} */
  const uploadFields = [
    {
      key: 'syndicateCard',
      label: 'صورة كارنيه نقابة الأطباء',
      hint: 'صورة واضحة للوجهين، بصيغة JPG أو PNG أو PDF',
      icon: 'GraduationCap',
      required: true
    },
    {
      key: 'idCard',
      label: 'صورة البطاقة الشخصية',
      hint: 'صورة واضحة للوجهين',
      icon: 'CreditCard',
      required: true
    },
    {
      key: 'specialtyCertificate',
      label: 'شهادة التخصص',
      hint: 'إن وجدت — اختياري',
      icon: 'FileText',
      required: false
    },
    {
      key: 'personalPhoto',
      label: 'صورة شخصية',
      hint: 'صورة حديثة وواضحة للوجه',
      icon: 'Camera',
      required: true
    }
  ];

  let step1Valid = $derived(
    form.fullName.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    form.nationalId.trim() &&
    form.syndicateNumber.trim() &&
    form.birthDate &&
    form.specialty.trim() &&
    form.degree &&
    form.governorate
  );

  let step2Valid = $derived(files.syndicateCard && files.idCard && files.personalPhoto);

  function openDoctorModal() {
    showDoctorModal = true;
    step = 1;
    submitted = false;
    closeMobileMenu();
  }

  function closeDoctorModal() {
    showDoctorModal = false;
  }

  function goToStep2() {
    if (step1Valid) step = 2;
  }

  function goToStep1() {
    step = 1;
  }

  /**
   * @param {Event} event
   * @param {string} key
   */
  function handleFileChange(event, key) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const file = target.files?.[0] ?? null;
    setFile(key, file);
  }

  function submitRegistration() {
    if (!step2Valid || submitting) return;
    submitting = true;
    // NOTE: wire this up to the real registration endpoint.
    setTimeout(() => {
      submitting = false;
      submitted = true;
      goto('/doctor-dashboard');
    }, 700);
  }

  function resetAndClose() {
    showDoctorModal = false;
    step = 1;
    submitted = false;
    form = {
      fullName: '',
      phone: '',
      email: '',
      nationalId: '',
      syndicateNumber: '',
      birthDate: '',
      specialty: '',
      degree: '',
      governorate: ''
    };
    files = {
      syndicateCard: null,
      idCard: null,
      specialtyCertificate: null,
      personalPhoto: null
    };
  }
</script>

<svelte:head>
  <title>Medical Care — استشاراتك الطبية أونلاين</title>
  <meta
    name="description"
    content="منصة للاستشارات الطبية أونلاين تربط المرضى بالأطباء بطريقة سهلة وآمنة."
  />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com"/>
  <link
    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Markazi+Text:wght@500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="app">

  <!-- Header -->
  <header class="navbar">
    <div class="container nav-content">

      <div class="logo">
        <div class="logo-icon">
          <Stethoscope size={25} />
        </div>

        <div>
          <h2>Medical Care</h2>
          <span>استشاراتك الطبية أونلاين</span>
        </div>
      </div>

      <nav class:open={mobileMenuOpen}>
        <a href="#home" onclick={closeMobileMenu}>الرئيسية</a>
        <a href="#services" onclick={closeMobileMenu}>الخدمات</a>
        <a href="#how" onclick={closeMobileMenu}>كيف يعمل؟</a>
        <a href="#doctors" onclick={closeMobileMenu}>الأطباء</a>
        <a href="#security" onclick={closeMobileMenu}>الأمان</a>
        <button class="primary-btn nav-mobile-cta" onclick={openDoctorModal}>
          أنا طبيب
        </button>
      </nav>

      <button
        class="menu-toggle"
        aria-label={mobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
        aria-expanded={mobileMenuOpen}
        onclick={toggleMobileMenu}
      >
        {#if mobileMenuOpen}
          <X size={22} />
        {:else}
          <Menu size={22} />
        {/if}
      </button>

    </div>
  </header>


  <!-- Hero -->
  <main id="home">

    <section class="hero">
      <div class="container hero-content">

        <div class="hero-text">

          <div class="badge">
            <CheckCircle2 size={17} />
            رعاية طبية موثوقة من أي مكان
          </div>

          <h1>
            استشر طبيبك
            <span>أونلاين</span>
            بسهولة وأمان
          </h1>

          <p>
            منصة طبية تربطك بأطباء متخصصين، تقدر من خلالها
            تبحث عن الطبيب المناسب، تحجز استشارتك وتتكلم معاه
            عن طريق الشات أو المكالمة الصوتية أو الفيديو.
          </p>

          <div class="hero-buttons">
            <button class="primary-btn large">
              ابحث عن طبيب
              <ArrowLeft size={19} class="flip-rtl" />
            </button>

            <button class="outline-btn large" onclick={openDoctorModal}>
              أنا طبيب
              <Stethoscope size={19} />
            </button>
          </div>

          <div class="hero-features">

            <div>
              <ShieldCheck size={20} />
              <span>خصوصية وأمان</span>
            </div>

            <div>
              <Clock3 size={20} />
              <span>أطباء متاحون الآن</span>
            </div>

            <div>
              <Wallet size={20} />
              <span>دفع إلكتروني آمن</span>
            </div>

          </div>

        </div>


        <div class="hero-card">

          <div class="floating-card top">

            <div class="doctor-mini">

              <div class="doctor-avatar">
                د
              </div>

              <div>
                <strong>د. أحمد محمد</strong>
                <small>استشاري باطنة</small>
              </div>

            </div>

            <span class="online">
              <i></i>
              متاح الآن
            </span>

          </div>


          <div class="medical-card">

            <div class="medical-icon">
              <Video size={34} />
            </div>

            <h3>استشارة طبية أونلاين</h3>

            <p>
              تواصل مع طبيبك بالصوت أو الفيديو
              واحصل على الرعاية التي تحتاجها.
            </p>

            <div class="consultation-info">

              <div>
                <Clock3 size={17} />
                <span>30 دقيقة</span>
              </div>

              <div>
                <Star size={17} />
                <span>4.9</span>
              </div>

            </div>

            <button class="primary-btn full">
              احجز استشارتك
            </button>

          </div>


          <div class="floating-card bottom">

            <ShieldCheck size={22} />

            <div>
              <strong>بياناتك محمية</strong>
              <small>رقم الهاتف لا يظهر للطرفين</small>
            </div>

          </div>

        </div>

      </div>
    </section>


    <!-- Services -->
    <section id="services" class="section services">

      <div class="container">

        <div class="section-heading">
          <span>خدماتنا</span>

          <h2>
            كل ما تحتاجه في استشارتك الطبية
          </h2>

          <p>
            اختار الطريقة المناسبة لك وتواصل مع طبيبك بسهولة.
          </p>
        </div>


        <div class="services-grid">

          <div class="service-card">

            <div class="service-icon">
              <MessageCircle />
            </div>

            <h3>Chat Consultation</h3>

            <p>
              تحدث مع الطبيب وأرسل الرسائل والصور
              والتقارير الطبية والملفات.
            </p>

          </div>


          <div class="service-card">

            <div class="service-icon">
              <Phone />
            </div>

            <h3>Audio Consultation</h3>

            <p>
              احجز مكالمة صوتية مع الطبيب في الوقت
              الذي يناسبك.
            </p>

          </div>


          <div class="service-card">

            <div class="service-icon">
              <Video />
            </div>

            <h3>Video Consultation</h3>

            <p>
              مقابلة فيديو مباشرة مع الطبيب مع إمكانية
              استخدام الشات أثناء المكالمة.
            </p>

          </div>


          <div class="service-card">

            <div class="service-icon">
              <FileText />
            </div>

            <h3>Medical Records</h3>

            <p>
              احتفظ بسجل استشاراتك وتقاريرك الطبية
              في حسابك بشكل منظم.
            </p>

          </div>

        </div>

      </div>

    </section>


    <!-- How it works -->
    <section id="how" class="section how-section">

      <div class="container">

        <div class="section-heading">

          <span>طريقة الاستخدام</span>

          <h2>
            استشارتك الطبية في 4 خطوات
          </h2>

        </div>


        <div class="steps">

          <div class="step">

            <div class="step-number">01</div>

            <Search />

            <h3>ابحث عن طبيب</h3>

            <p>
              ابحث حسب التخصص أو الاسم أو الخبرة أو التقييم.
            </p>

          </div>


          <div class="step">

            <div class="step-number">02</div>

            <CalendarDays />

            <h3>اختار الموعد</h3>

            <p>
              اختار اليوم والوقت ونوع الاستشارة المناسب.
            </p>

          </div>


          <div class="step">

            <div class="step-number">03</div>

            <Wallet />

            <h3>ادفع بأمان</h3>

            <p>
              ادفع باستخدام الطرق الإلكترونية المتاحة.
            </p>

          </div>


          <div class="step">

            <div class="step-number">04</div>

            <Video />

            <h3>ابدأ الاستشارة</h3>

            <p>
              تواصل مع الطبيب عن طريق Chat أو Audio أو Video.
            </p>

          </div>

        </div>

      </div>

    </section>


    <!-- Doctors -->
    <section id="doctors" class="section doctors-section">

      <div class="container">

        <div class="section-heading">

          <span>أطباء موثوقون</span>

          <h2>
            اختار الطبيب المناسب لك
          </h2>

          <p>
            أطباء من تخصصات مختلفة مع ملفات تعريف وتقييمات واضحة.
          </p>

        </div>


        <div class="doctor-grid">

          <div class="doctor-card">

            <div class="doctor-photo">د</div>

            <div class="verified">
              <ShieldCheck size={15} />
              طبيب موثق
            </div>

            <h3>د. أحمد محمد</h3>

            <p>استشاري باطنة</p>

            <div class="rating">
              <Star size={17} fill="currentColor" />
              4.9
              <span>(120 تقييم)</span>
            </div>

            <div class="doctor-price">
              <span>تبدأ الاستشارة من</span>
              <strong>200 جنيه</strong>
            </div>

            <button class="outline-btn full">
              عرض الملف
            </button>

          </div>


          <div class="doctor-card">

            <div class="doctor-photo">د</div>

            <div class="verified">
              <ShieldCheck size={15} />
              طبيب موثق
            </div>

            <h3>د. سارة محمود</h3>

            <p>استشاري نساء وتوليد</p>

            <div class="rating">
              <Star size={17} fill="currentColor" />
              4.8
              <span>(96 تقييم)</span>
            </div>

            <div class="doctor-price">
              <span>تبدأ الاستشارة من</span>
              <strong>250 جنيه</strong>
            </div>

            <button class="outline-btn full">
              عرض الملف
            </button>

          </div>


          <div class="doctor-card">

            <div class="doctor-photo">د</div>

            <div class="verified">
              <ShieldCheck size={15} />
              طبيب موثق
            </div>

            <h3>د. محمد علي</h3>

            <p>استشاري أطفال</p>

            <div class="rating">
              <Star size={17} fill="currentColor" />
              4.9
              <span>(143 تقييم)</span>
            </div>

            <div class="doctor-price">
              <span>تبدأ الاستشارة من</span>
              <strong>200 جنيه</strong>
            </div>

            <button class="outline-btn full">
              عرض الملف
            </button>

          </div>

        </div>

      </div>

    </section>


    <!-- Security -->
    <section id="security" class="security-section">

      <div class="container security-content">

        <div>

          <div class="security-badge">
            <ShieldCheck size={18} />
            خصوصيتك أولويتنا
          </div>

          <h2>
            استشر طبيبك بدون مشاركة
            <span>رقم هاتفك</span>
          </h2>

          <p>
            التواصل بين المريض والطبيب يتم من خلال المنصة،
            لذلك لا تحتاج إلى مشاركة رقم هاتفك مع أي طرف.
          </p>

          <div class="security-list">

            <div>
              <CheckCircle2 />
              <span>
                صلاحيات مختلفة للمريض والطبيب والإدارة
              </span>
            </div>

            <div>
              <CheckCircle2 />
              <span>
                تأمين عمليات تسجيل الدخول والتحقق
              </span>
            </div>

            <div>
              <CheckCircle2 />
              <span>
                حماية الملفات والتقارير الطبية
              </span>
            </div>

            <div>
              <CheckCircle2 />
              <span>
                مدفوعات إلكترونية آمنة
              </span>
            </div>

          </div>

        </div>


        <div class="security-visual">

          <div class="security-circle">
            <ShieldCheck size={70} />
          </div>

          <div class="secure-box">

            <Lock size={22} />

            <div>
              <strong>Private Consultation</strong>
              <small>
                معلوماتك الطبية تظل خاصة
              </small>
            </div>

          </div>

        </div>

      </div>

    </section>


    <!-- Doctor Registration -->
    <section class="doctor-register">

      <div class="container doctor-register-content">

        <div>

          <span>للأطباء</span>

          <h2>
            انضم إلى منصتنا وابدأ تقديم الاستشارات
          </h2>

          <p>
            أنشئ ملفك الطبي، حدد أسعار خدماتك ومواعيدك،
            واستقبل طلبات المرضى بعد إتمام عملية التحقق.
          </p>

        </div>


        <div class="registration-points">

          <div>
            <UserRound />
            <span>بيانات الطبيب الأساسية</span>
          </div>

          <div>
            <FileText />
            <span>رفع المستندات المطلوبة</span>
          </div>

          <div>
            <ShieldCheck />
            <span>مراجعة وتوثيق الحساب</span>
          </div>

        </div>


        <button class="white-btn" onclick={openDoctorModal}>

          التسجيل كطبيب

          <ArrowLeft size={18} class="flip-rtl" />

        </button>

      </div>

    </section>

  </main>


  <!-- Footer -->
  <footer>

    <div class="container footer-content">

      <div class="logo">

        <div class="logo-icon">
          <Stethoscope size={22} />
        </div>

        <div>
          <h2>Medical Care</h2>
          <span>استشاراتك الطبية أونلاين</span>
        </div>

      </div>


      <p>
        منصة للاستشارات الطبية عن بُعد تربط المرضى
        بالأطباء بطريقة سهلة وآمنة.
      </p>


      <span class="copyright">
        © 2026 Medical Care. جميع الحقوق محفوظة.
      </span>

    </div>

  </footer>


  <!-- Doctor Registration Modal -->
  {#if showDoctorModal}
    <div
      class="modal-overlay"
      role="dialog"
      aria-label="تسجيل طبيب"
      tabindex="0"
      onclick={closeDoctorModal}
      onkeydown={(e) => e.key === 'Escape' && closeDoctorModal()}
    >
      <div
        class="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doctor-modal-title"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >

        <div class="modal-header">
          <div>
            <span class="modal-eyebrow">انضمام الأطباء</span>
            <h2 id="doctor-modal-title">التسجيل كطبيب</h2>
          </div>

          <button class="modal-close" aria-label="إغلاق" onclick={resetAndClose}>
            <X size={20} />
          </button>
        </div>

        {#if !submitted}

          <div class="modal-steps">

            <div class="modal-step" class:active={step === 1} class:done={step > 1}>
              <span class="modal-step-dot">{step > 1 ? '✓' : '1'}</span>
              <span>التسجيل الأولي</span>
            </div>

            <div class="modal-step-line"></div>

            <div class="modal-step" class:active={step === 2}>
              <span class="modal-step-dot">2</span>
              <span>رفع المستندات</span>
            </div>

          </div>


          <div class="modal-body">

            {#if step === 1}

              <div class="form-grid">

                <label class="field">
                  <span><UserRound size={15} /> الاسم رباعي</span>
                  <input
                    type="text"
                    placeholder="مثال: محمد أحمد علي إبراهيم"
                    bind:value={form.fullName}
                  />
                </label>

                <label class="field">
                  <span><Smartphone size={15} /> رقم الموبايل</span>
                  <input
                    type="tel"
                    placeholder="01xxxxxxxxx"
                    bind:value={form.phone}
                  />
                </label>

                <label class="field">
                  <span><Mail size={15} /> البريد الإلكتروني</span>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    bind:value={form.email}
                  />
                </label>

                <label class="field">
                  <span><Fingerprint size={15} /> الرقم القومي</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    maxlength="14"
                    placeholder="14 رقم"
                    bind:value={form.nationalId}
                  />
                </label>

                <label class="field">
                  <span><GraduationCap size={15} /> رقم قيد نقابة الأطباء</span>
                  <input
                    type="text"
                    placeholder="رقم القيد"
                    bind:value={form.syndicateNumber}
                  />
                </label>

                <label class="field">
                  <span><CalendarDays size={15} /> تاريخ الميلاد</span>
                  <input type="date" bind:value={form.birthDate} />
                </label>

                <label class="field">
                  <span><Stethoscope size={15} /> التخصص</span>
                  <input
                    type="text"
                    placeholder="مثال: باطنة، أطفال، نساء وتوليد"
                    bind:value={form.specialty}
                  />
                </label>

                <label class="field">
                  <span><ShieldCheck size={15} /> الدرجة المهنية</span>
                  <select bind:value={form.degree}>
                    <option value="" disabled selected>اختار الدرجة المهنية</option>
                    {#each degrees as degree}
                      <option value={degree}>{degree}</option>
                    {/each}
                  </select>
                </label>

                <label class="field field-wide">
                  <span><MapPin size={15} /> المحافظة</span>
                  <select bind:value={form.governorate}>
                    <option value="" disabled selected>اختار المحافظة</option>
                    {#each governorates as gov}
                      <option value={gov}>{gov}</option>
                    {/each}
                  </select>
                </label>

              </div>

            {:else}

              <p class="upload-intro">
                ارفع المستندات التالية للتحقق من هويتك ومؤهلك المهني.
                الصيغ المقبولة: JPG، PNG، PDF — بحد أقصى 5MB لكل ملف.
              </p>

              <div class="upload-grid">

                {#each uploadFields as f}
                  <div class="upload-card" class:has-file={files[f.key]}>

                    <div class="upload-icon">
                      {#if f.icon === 'GraduationCap'}
                        <GraduationCap size={22} />
                      {:else if f.icon === 'CreditCard'}
                        <CreditCard size={22} />
                      {:else if f.icon === 'FileText'}
                        <FileText size={22} />
                      {:else if f.icon === 'Camera'}
                        <Camera size={22} />
                      {/if}
                    </div>

                    <div class="upload-text">
                      <strong>
                        {f.label}
                        {#if !f.required}<span class="optional-tag">اختياري</span>{/if}
                      </strong>
                      <small>{f.hint}</small>

                      {#if files[f.key]}
                        <span class="file-chosen">
                          <CheckCircle2 size={14} />
                          {files[f.key].name}
                        </span>
                      {/if}
                    </div>

                    <label class="upload-btn">
                      <Upload size={16} />
                      {files[f.key] ? 'تغيير الملف' : 'اختر ملف'}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onchange={(e) => handleFileChange(e, f.key)}
                      />
                    </label>

                  </div>
                {/each}

              </div>

            {/if}

          </div>


          <div class="modal-footer">

            {#if step === 1}
              <span class="modal-footer-hint">الخطوة 1 من 2</span>

              <button
                class="primary-btn"
                disabled={!step1Valid}
                onclick={goToStep2}
              >
                التالي
                <ArrowLeft size={17} class="flip-rtl" />
              </button>
            {:else}
              <button class="outline-btn" onclick={goToStep1}>
                رجوع
              </button>

              <button
                class="primary-btn"
                disabled={!step2Valid || submitting}
                onclick={submitRegistration}
              >
                {submitting ? 'جاري الإرسال...' : 'إرسال طلب التسجيل'}
              </button>
            {/if}

          </div>

        {:else}

          <div class="success-state">

            <div class="success-icon">
              <CheckCircle2 size={40} />
            </div>

            <h3>تم استلام طلبك بنجاح</h3>

            <p>
              سيقوم فريقنا بمراجعة بياناتك ومستنداتك،
              وسنتواصل معك على {form.email || 'بريدك الإلكتروني'}
              خلال 2-3 أيام عمل لإتمام عملية التوثيق.
            </p>

            <button class="primary-btn" onclick={resetAndClose}>
              تم
            </button>

          </div>

        {/if}

      </div>
    </div>
  {/if}

</div>

<style>
.app {
    --paper: #f7f4ee;
    --paper-deep: #efe9dd;
    --ink: #1d2621;
    --ink-soft: #4b564f;
    --pine: #163832;
    --pine-light: #24544a;
    --pine-mist: #e4ece9;
    --apricot: #e0793f;
    --apricot-deep: #c25f2b;
    --gold: #c9973f;
    --line: #ddd5c4;
    --white: #ffffff;
    --success: #3f9c6f;
 
    --font-head: 'Markazi Text', 'IBM Plex Sans Arabic', serif;
    --font-body: 'IBM Plex Sans Arabic', 'Segoe UI', sans-serif;
 
    direction: rtl;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-body);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow-x: hidden;
  }
 
  .app :global(*) {
    box-sizing: border-box;
    max-width: 100%;
  }
 
  .app :global(h1),
  .app :global(h2),
  .app :global(h3) {
    font-family: var(--font-head);
    color: var(--pine);
    margin: 0;
    font-weight: 600;
  }
 
  .app :global(p) {
    margin: 0;
    color: var(--ink-soft);
  }
 
  .app :global(a) {
    color: inherit;
    text-decoration: none;
  }
 
  .app :global(button) {
    font-family: var(--font-body);
    cursor: pointer;
    border: none;
    background: none;
  }
 
  .app :global(:focus-visible) {
    outline: 2px solid var(--apricot);
    outline-offset: 3px;
  }
 
  @media (prefers-reduced-motion: reduce) {
    .app :global(*) {
      transition: none !important;
      animation: none !important;
    }
  }
 
  .container {
  width: 100%;
  max-width: 1180px;
  margin-inline: auto;
  padding-inline: 32px;
}

@media (max-width: 600px) {
  .container {
    width: 100%;
    padding-inline: 16px;
  }
}

@media (max-width: 380px) {
  .container {
    padding-inline: 12px;
  }
}
 
  /* ---------------- Buttons ---------------- */
  .primary-btn,
  .outline-btn,
  .white-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 12px 26px;
    border-radius: 999px;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }
 
  .primary-btn {
  background: var(--pine);
  color: black;
  box-shadow: 0 8px 20px -8px rgba(22, 56, 50, 0.45);
}

.primary-btn:hover {
  background: var(--apricot);
  color: var(--white);
  transform: translateY(-2px);
  box-shadow: 0 12px 24px -10px rgba(224, 121, 63, 0.45);
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.primary-btn:disabled:hover {
  background: var(--pine);
  color: black;
}

.outline-btn {
  background: transparent;
  color: var(--pine);
  border: 1.5px solid var(--pine);
}

.outline-btn:hover {
  background: var(--pine);
  color: var(--white);
  transform: translateY(-2px);
}
 
  .white-btn {
    background: var(--paper);
    color: var(--pine);
    margin-top: 12px;
  }
 
  .white-btn:hover {
    background: var(--white);
    transform: translateY(-1px);
  }
 
  .primary-btn.large,
  .outline-btn.large {
    padding: 14px 30px;
    font-size: 1rem;
  }
 
  .primary-btn.full {
    width: 100%;
  }
 
  .outline-btn.full {
    width: 100%;
    margin-top: 18px;
  }

  @media (max-width: 480px) {
    .hero-buttons .primary-btn.large,
    .hero-buttons .outline-btn.large {
      width: 100%;
    }
  }
 
  /* ---------------- Header ---------------- */
  .navbar {
    position: sticky;
    top: 0;
    z-index: 40;
    background: rgba(247, 244, 238, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
 
  .nav-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 78px;
    position: relative;
  }
 
  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
 
  .logo-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: var(--pine);
    color: var(--paper);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
 
  .logo h2 {
    font-size: 1.15rem;
    line-height: 1.1;
    white-space: nowrap;
  }
 
  .logo span {
    font-size: 0.75rem;
    color: var(--ink-soft);
    white-space: nowrap;
  }
 
  nav {
    display: flex;
    align-items: center;
    gap: 30px;
  }
 
  nav a {
    font-size: 0.92rem;
    color: var(--ink-soft);
    position: relative;
    padding: 6px 0;
  }
 
  nav a:hover {
    color: var(--pine);
  }

  .nav-mobile-cta {
    display: none;
  }

  .menu-toggle {
    display: none;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: var(--pine-mist);
    color: var(--pine);
    flex-shrink: 0;
  }
 
  @media (max-width: 900px) {
    .logo span {
      display: none;
    }

    nav {
      display: none;
      position: absolute;
      top: 100%;
      inset-inline: 0;
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
      background: var(--paper);
      border-bottom: 1px solid var(--line);
      padding: 10px 20px 20px;
      box-shadow: 0 16px 30px -18px rgba(29, 38, 33, 0.3);
    }

    nav.open {
      display: flex;
    }

    nav a {
      padding: 12px 4px;
      border-bottom: 1px solid var(--line);
      font-size: 1rem;
    }

    .nav-mobile-cta {
      display: inline-flex;
      margin-top: 12px;
    }

    .menu-toggle {
      display: flex;
    }
  }
 
  /* ---------------- Hero ---------------- */
  .hero {
    padding: 76px 0 96px;
    overflow: hidden;
  }
 
  .hero-content {
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 56px;
    align-items: center;
  }
 
  .hero-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 22px;
  }
 
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--pine-mist);
    color: var(--pine);
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
  }
 
  .hero-text h1 {
    font-size: 3rem;
    line-height: 1.25;
    display: flex;
    flex-wrap: wrap;
    gap: 0 12px;
  }
 
  .hero-text h1 span {
    color: var(--apricot);
  }
 
  .hero-text > p {
    font-size: 1.05rem;
    max-width: 480px;
  }
 
  .hero-buttons {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    width: 100%;
  }
 
  .hero-buttons :global(.flip-rtl),
  .white-btn :global(.flip-rtl),
  .modal-footer :global(.flip-rtl) {
    transform: scaleX(-1);
  }
 
  .hero-features {
    display: flex;
    gap: 28px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
 
  .hero-features > div {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
    color: var(--ink-soft);
  }
 
  .hero-features :global(svg) {
    color: var(--gold);
  }
 
  /* ---- hero visual stack ---- */
  .hero-card {
    position: relative;
    display: flex;
    justify-content: center;
    padding: 20px 0;
  }
 
  .medical-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 340px;
    background: var(--pine);
    color: var(--paper);
    border-radius: 26px;
    padding: 34px 30px;
    text-align: center;
    box-shadow: 0 30px 60px -20px rgba(22, 56, 50, 0.55);
  }
 
  .medical-icon {
    width: 68px;
    height: 68px;
    margin: 0 auto 18px;
    border-radius: 18px;
    background: rgba(247, 244, 238, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--apricot);
  }
 
  .medical-card h3 {
    color: var(--paper);
    font-size: 1.3rem;
    margin-bottom: 10px;
  }
 
  .medical-card p {
    color: rgba(247, 244, 238, 0.75);
    font-size: 0.9rem;
  }
 
  .consultation-info {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin: 22px 0;
    padding: 14px 0;
    border-top: 1px solid rgba(247, 244, 238, 0.18);
    border-bottom: 1px solid rgba(247, 244, 238, 0.18);
  }
 
  .consultation-info > div {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    color: rgba(247, 244, 238, 0.85);
  }
 
  .medical-card .primary-btn {
    background: var(--apricot);
    color: var(--white);
  }
 
  .medical-card .primary-btn:hover {
    background: var(--apricot-deep);
  }
 
  .floating-card {
    position: absolute;
    z-index: 2;
    background: var(--white);
    border-radius: 18px;
    padding: 14px 18px;
    box-shadow: 0 18px 34px -14px rgba(29, 38, 33, 0.25);
    display: flex;
    align-items: center;
    gap: 14px;
    border: 1px solid var(--line);
  }
 
  .floating-card.top {
    top: -31px;
    right: -50px;
    justify-content: space-between;
    width: min(100%, 360px);
  }
 
  .floating-card.bottom {
    bottom: -26px;
    left: -18px;
    max-width: 260px;
    color: var(--pine);
  }
 
  .floating-card.bottom :global(svg) {
    color: var(--gold);
    flex-shrink: 0;
  }
 
  .floating-card strong {
    display: block;
    font-size: 0.86rem;
    color: var(--ink);
  }
 
  .floating-card small {
    font-size: 0.76rem;
    color: var(--ink-soft);
  }
 
  .doctor-mini {
    display: flex;
    align-items: center;
    gap: 10px;
  }
 
  .doctor-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--pine-mist);
    color: var(--pine);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    flex-shrink: 0;
  }
 
  .online {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    color: var(--pine-light);
    font-weight: 600;
    white-space: nowrap;
  }
 
  .online i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    display: inline-block;
  }
 
  @media (max-width: 900px) {
    .hero {
      width: 100%;
      padding: 42px 0 56px;
    }

    .hero-content {
      width: 100%;
      grid-template-columns: 1fr;
      gap: 36px;
    }
 
    .hero-text {
      width: 100%;
      align-items: center;
      text-align: center;
    }
 
    .hero-text > p {
       width: 100%;
       max-width: 100%;
       font-size: 0.95rem;
    }
 
     .hero-buttons {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .hero-buttons .primary-btn,
  .hero-buttons .outline-btn {
    width: 100%;
  }

  .hero-features {
    width: 100%;
    justify-content: center;
    gap: 14px;
  }

    .hero-card {
       width: 100%;
       flex-direction: column;
       align-items: center;
       gap: 14px;
       margin-top: 20px;
       padding: 10px 0;
    }

    .floating-card.top,
    .floating-card.bottom {
      position: static;
      inset: auto;
      width: 100%;
      max-width: 340px;
      margin: 0;
    }
  }
 
  @media (max-width: 480px) {
    .hero-text h1 {
      font-size: 2rem;
      justify-content: center;
    }

    .badge {
      font-size: 0.78rem;
      text-align: center;
    }

    .hero-text > p {
      font-size: 0.95rem;
    }

    .hero-features {
      gap: 16px 20px;
      justify-content: center;
    }

    .hero-features > div {
      font-size: 0.82rem;
    }

    .medical-card {
      padding: 28px 22px;
    }
  }
 
  /* ---------------- Shared section heading ---------------- */
  .section {
    padding: 92px 0;
  }
 
  .section-heading {
    max-width: 620px;
    margin: 0 auto 52px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
 
  .section-heading > span {
    color: var(--apricot-deep);
    font-weight: 700;
    font-size: 0.9rem;
  }
 
  .section-heading h2 {
    font-size: 2.1rem;
  }
 
  .section-heading p {
    font-size: 1rem;
  }

  @media (max-width: 900px) {
    .section {
      padding: 64px 0;
    }

    .section-heading {
      margin-bottom: 36px;
    }

    .section-heading h2 {
      font-size: 1.7rem;
    }
  }

  @media (max-width: 480px) {
    .section-heading h2 {
      font-size: 1.5rem;
    }

    .section-heading p {
      font-size: 0.92rem;
    }
  }
 
  /* ---------------- Services ---------------- */
  .services {
    background: var(--paper-deep);
  }
 
  .services-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 22px;
  }
 
  .service-card {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 30px 24px;
    text-align: center;
    transition: border-color 0.2s ease, transform 0.2s ease;
  }
 
  .service-card:hover {
    border-color: var(--pine-light);
    transform: translateY(-4px);
  }
 
  .service-icon {
    width: 54px;
    height: 54px;
    margin: 0 auto 18px;
    border-radius: 14px;
    background: var(--pine-mist);
    color: var(--pine);
    display: flex;
    align-items: center;
    justify-content: center;
  }
 
  .service-card h3 {
    font-family: var(--font-body);
    font-size: 1rem;
    font-weight: 700;
    color: var(--ink);
    margin-bottom: 10px;
    direction: ltr;
  }
 
  .service-card p {
    font-size: 0.9rem;
  }
 
  @media (max-width: 900px) {
    .services-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
 
  @media (max-width: 520px) {
    .services-grid {
      grid-template-columns: 1fr;
    }

    .service-card {
      padding: 24px 20px;
    }
  }
 
  /* ---------------- How it works ---------------- */
  .steps {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    position: relative;
  }
 
  .step {
    position: relative;
    padding: 0 18px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
 
  .step::before {
    content: '';
    position: absolute;
    top: 27px;
    right: calc(-50% + 27px);
    width: calc(100% - 54px);
    height: 1.5px;
    background: repeating-linear-gradient(
      to left,
      var(--line) 0 8px,
      transparent 8px 14px
    );
  }
 
  .step:first-child::before {
    display: none;
  }
 
  .step-number {
    position: absolute;
    top: -10px;
    right: 50%;
    transform: translateX(50%);
    font-family: var(--font-head);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--apricot-deep);
  }
 
  .step :global(svg) {
    width: 54px;
    height: 54px;
    padding: 14px;
    border-radius: 50%;
    background: var(--pine);
    color: var(--paper);
  }
 
  .step h3 {
    font-size: 1.05rem;
  }
 
  .step p {
    font-size: 0.88rem;
    max-width: 220px;
  }
 
  @media (max-width: 900px) {
    .steps {
      grid-template-columns: repeat(2, 1fr);
      row-gap: 48px;
    }
 
    .step::before {
      display: none;
    }
  }
 
  @media (max-width: 520px) {
    .steps {
      grid-template-columns: 1fr;
      row-gap: 32px;
    }
  }
 
  /* ---------------- Doctors ---------------- */
  .doctors-section {
    background: var(--paper-deep);
  }
 
  .doctor-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
 
  .doctor-card {
    position: relative;
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 22px;
    padding: 30px 26px;
    text-align: center;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
 
  .doctor-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 22px 40px -22px rgba(29, 38, 33, 0.25);
  }
 
  .doctor-photo {
    width: 74px;
    height: 74px;
    margin: 0 auto 14px;
    border-radius: 50%;
    background: var(--pine);
    color: var(--paper);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 700;
  }
 
  .verified {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--pine-mist);
    color: var(--pine-light);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 999px;
    margin-bottom: 14px;
  }
 
  .doctor-card h3 {
    font-size: 1.15rem;
    margin-bottom: 4px;
  }
 
  .doctor-card > p {
    font-size: 0.88rem;
    margin-bottom: 14px;
  }
 
  .rating {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--gold);
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 18px;
  }
 
  .rating span {
    color: var(--ink-soft);
    font-weight: 400;
    font-size: 0.82rem;
  }
 
  .doctor-price {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 16px;
    border-top: 1px dashed var(--line);
  }
 
  .doctor-price span {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
 
  .doctor-price strong {
    font-family: var(--font-head);
    font-size: 1.3rem;
    color: var(--pine);
  }
 
  @media (max-width: 900px) {
    .doctor-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
 
  @media (max-width: 560px) {
    .doctor-grid {
      grid-template-columns: 1fr;
    }
  }
 
  /* ---------------- Security ---------------- */
  .security-section {
    padding: 100px 0;
    background: var(--pine);
    color: var(--paper);
  }
 
  .security-content {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 60px;
    align-items: center;
  }
 
  .security-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(247, 244, 238, 0.12);
    color: var(--paper);
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 20px;
  }
 
  .security-content h2 {
    color: var(--paper);
    font-size: 2.1rem;
    line-height: 1.35;
    margin-bottom: 16px;
  }
 
  .security-content h2 span {
    color: var(--apricot);
  }
 
  .security-content > div > p {
    color: rgba(247, 244, 238, 0.72);
    font-size: 1rem;
    max-width: 460px;
    margin-bottom: 30px;
  }
 
  .security-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
 
  .security-list > div {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.94rem;
    color: rgba(247, 244, 238, 0.9);
  }
 
  .security-list :global(svg) {
    color: var(--gold);
    flex-shrink: 0;
  }
 
  .security-visual {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 300px;
  }
 
  .security-circle {
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: rgba(247, 244, 238, 0.08);
    border: 1.5px solid rgba(247, 244, 238, 0.22);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--apricot);
  }
 
  .secure-box {
    position: absolute;
    bottom: 12px;
    left: 0;
    background: var(--white);
    color: var(--ink);
    border-radius: 16px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 20px 40px -18px rgba(0, 0, 0, 0.4);
    max-width: 250px;
  }
 
  .secure-box :global(svg) {
    color: var(--apricot-deep);
    flex-shrink: 0;
  }
 
  .secure-box strong {
    display: block;
    font-size: 0.86rem;
    direction: ltr;
    text-align: left;
  }
 
  .secure-box small {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
 
  @media (max-width: 900px) {
    .security-section {
      padding: 64px 0;
    }

    .security-content {
      grid-template-columns: 1fr;
    }
 
    .security-content > div > p {
      max-width: 100%;
    }

    .security-content h2 {
      font-size: 1.7rem;
    }
 
    .secure-box {
      position: static;
      margin-top: 18px;
    }

    .security-visual {
      min-height: auto;
    }
  }

  /* Mobile fine-tune for the security section (small phones) */
  @media (max-width: 480px) {
    .security-content h2 {
      font-size: 1.4rem;
    }

    .security-badge {
      font-size: 0.78rem;
      padding: 7px 14px;
    }

    .security-content > div > p {
      font-size: 0.92rem;
    }

    .security-list > div {
      font-size: 0.88rem;
    }

    .security-circle {
      width: 160px;
      height: 160px;
    }

    .security-circle :global(svg) {
      width: 48px;
      height: 48px;
    }

    .secure-box {
      max-width: 100%;
      width: 100%;
      padding: 12px 14px;
    }

    .secure-box strong {
      font-size: 0.8rem;
    }

    .secure-box small {
      font-size: 0.72rem;
    }
  }
 
  /* ---------------- Doctor registration CTA section ---------------- */
  .doctor-register {
    background: var(--apricot);
    padding: 90px 0;
  }
 
  .doctor-register-content {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 26px;
    color: var(--white);
  }
 
  .doctor-register-content > div > span {
    font-weight: 700;
    font-size: 0.88rem;
    color: rgba(255, 255, 255, 0.85);
  }
 
  .doctor-register-content h2 {
    color: var(--white);
    font-size: 2rem;
    max-width: 560px;
    margin: 10px 0 14px;
  }
 
  .doctor-register-content > div > p {
    color: rgba(255, 255, 255, 0.85);
    max-width: 520px;
    margin: 0 auto;
  }
 
  .registration-points {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
    justify-content: center;
  }
 
  .registration-points > div {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.92rem;
    font-weight: 600;
  }

  @media (max-width: 900px) {
    .doctor-register {
      padding: 60px 0;
    }

    .doctor-register-content h2 {
      font-size: 1.6rem;
    }

    .registration-points {
      gap: 16px 24px;
    }
  }

  @media (max-width: 480px) {
    .registration-points > div {
      font-size: 0.85rem;
    }

    .white-btn {
      width: 100%;
    }
  }
 
  /* ---------------- Footer ---------------- */
  footer {
    background: var(--pine);
    color: rgba(247, 244, 238, 0.72);
    padding: 56px 0 34px;
  }
 
  .footer-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 16px;
  }
 
  footer .logo h2 {
    color: var(--paper);
  }
 
  footer .logo span {
    color: rgba(247, 244, 238, 0.6);
    display: inline;
  }
 
  footer .logo-icon {
    background: rgba(247, 244, 238, 0.12);
    color: var(--apricot);
  }
 
  footer p {
    max-width: 420px;
    font-size: 0.9rem;
    color: rgba(247, 244, 238, 0.68);
  }
 
  .copyright {
    font-size: 0.8rem;
    color: rgba(247, 244, 238, 0.45);
    padding-top: 20px;
    border-top: 1px solid rgba(247, 244, 238, 0.12);
    width: 100%;
    max-width: 300px;
  }

  /* ---------------- Doctor Registration Modal ---------------- */
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(20, 26, 23, 0.55);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .modal-box {
    width: 100%;
    max-width: 780px;
    max-height: 90vh;
    overflow-y: auto;
    background: var(--paper);
    border-radius: 24px;
    box-shadow: 0 40px 80px -24px rgba(0, 0, 0, 0.45);
    border: 1px solid var(--line);
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 32px 36px 0;
  }

  .modal-eyebrow {
    display: block;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--apricot-deep);
    margin-bottom: 6px;
  }

  .modal-header h2 {
    font-size: 1.8rem;
  }

  .modal-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-soft);
    background: var(--paper-deep);
    flex-shrink: 0;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .modal-close:hover {
    background: var(--pine);
    color: var(--paper);
  }

  .modal-steps {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 22px 28px 0;
  }

  .modal-step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .modal-step-dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--paper-deep);
    color: var(--ink-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    flex-shrink: 0;
  }

  .modal-step.active {
    color: var(--pine);
  }

  .modal-step.active .modal-step-dot {
    background: var(--pine);
    color: var(--paper);
  }

  .modal-step.done .modal-step-dot {
    background: var(--success);
    color: var(--white);
  }

  .modal-step-line {
    flex: 1;
    height: 1.5px;
    background: var(--line);
  }

  .modal-body {
    padding: 28px 36px 4px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .field-wide {
    grid-column: 1 / -1;
  }

  .field span {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
  }

  .field span :global(svg) {
    color: var(--gold);
    flex-shrink: 0;
  }

  .field input,
  .field select {
    font-family: var(--font-body);
    font-size: 1rem;
    color: var(--ink);
    background: var(--white);
    border: 1.5px solid var(--line);
    border-radius: 12px;
    padding: 13px 16px;
    transition: border-color 0.15s ease;
    width: 100%;
  }

  .field input:focus,
  .field select:focus {
    border-color: var(--pine-light);
  }

  @media (max-width: 560px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
  }

  .upload-intro {
    font-size: 0.9rem;
    margin-bottom: 18px;
  }

  .upload-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .upload-card {
    display: flex;
    align-items: center;
    gap: 14px;
    border: 1.5px dashed var(--line);
    border-radius: 16px;
    padding: 16px 18px;
    background: var(--white);
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }

  .upload-card.has-file {
    border-style: solid;
    border-color: var(--success);
    background: var(--pine-mist);
  }

  .upload-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--pine-mist);
    color: var(--pine);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .upload-card.has-file .upload-icon {
    background: var(--white);
    color: var(--success);
  }

  .upload-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .upload-text strong {
    font-size: 0.92rem;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .optional-tag {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-soft);
    background: var(--paper-deep);
    padding: 2px 8px;
    border-radius: 999px;
  }

  .upload-text small {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }

  .file-chosen {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--pine-light);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .upload-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--pine);
    background: var(--pine-mist);
    padding: 9px 14px;
    border-radius: 999px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .upload-btn:hover {
    background: var(--pine);
    color: var(--paper);
  }

  .upload-btn input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  @media (max-width: 560px) {
    .upload-card {
      flex-wrap: wrap;
    }

    .upload-btn {
      width: 100%;
    }
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 28px 36px 36px;
    margin-top: 8px;
    border-top: 1px solid var(--line);
  }

  .modal-footer-hint {
    font-size: 0.82rem;
    color: var(--ink-soft);
  }

  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
    padding: 20px 28px 36px;
  }

  .success-icon {
    width: 74px;
    height: 74px;
    border-radius: 50%;
    background: var(--pine-mist);
    color: var(--success);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }

  .success-state h3 {
    font-size: 1.3rem;
  }

  .success-state p {
    font-size: 0.92rem;
    max-width: 420px;
  }

  .success-state .primary-btn {
    margin-top: 10px;
  }

  /* ---------------- Modal: mobile ---------------- */
  @media (max-width: 640px) {
    .modal-overlay {
      padding: 0;
      align-items: flex-end;
    }

    .modal-box {
      max-width: 100%;
      max-height: 92vh;
      border-radius: 20px 20px 0 0;
    }

    .modal-header {
      padding: 22px 20px 0;
    }

    .modal-header h2 {
      font-size: 1.4rem;
    }

    .modal-steps {
      padding: 16px 20px 0;
    }

    .modal-step span:last-child {
      display: none;
    }

    .modal-body {
      padding: 20px 20px 4px;
    }

    .modal-footer {
      padding: 18px 20px 24px;
      flex-wrap: wrap;
    }

    .modal-footer .primary-btn,
    .modal-footer .outline-btn {
      flex: 1;
    }

    .modal-footer-hint {
      width: 100%;
      order: -1;
      text-align: center;
      margin-bottom: 4px;
    }

    .success-state {
      padding: 16px 20px 28px;
    }
  }
</style>