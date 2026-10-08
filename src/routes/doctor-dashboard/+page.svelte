<script lang="ts">
import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    Stethoscope,
    Star,
    ShieldCheck,
    CheckCircle2,
    Clock3,
    Users,
    MessageCircle,
    Phone,
    Video,
    CalendarDays,
    Wallet,
    ArrowLeft,
    Save,
    X,
    TrendingUp,
    Bell,
    Coffee,
    BadgeCheck,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Send,
    Paperclip,
    MoreVertical,
    PhoneCall,
    VideoIcon,
    ClockIcon,
    UserRound,
    Inbox,
    MapPin,
    Building2,
    Plus,
    Trash2,
    Clock
  } from 'lucide-svelte';

  // ---------------- Doctor profile (live from the Go API) ----------------

  // Mirrors the doctor row returned by GET /doctors.
  interface ApiDoctor {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    medical_syndicate_id: string;
    birth_date: string;
    specialty: string;
    professional_degree: string;
    governorate: string;
    is_online: boolean;
    created_at: string;
  }

  interface DoctorProfile {
    id: string;
    name: string;
    tagline: string;
    degree: string;
    specialty: string;
    governorate: string;
    phone: string;
    email: string;
    medicalSyndicateId: string;
    joinedAt: string;
    isOnline: boolean;
    // Base64 data URL from GET /doctors/:id — empty when the doctor uploaded none.
    profileImage: string;
  }

  const DOCTORS_API = '/api/doctors';

  function text(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
  }

  function toProfile(row: ApiDoctor): DoctorProfile {
    const name = text(row.full_name, 'طبيب مسجَّل');
    const degree = text(row.professional_degree, 'طبيب');
    const specialty = text(row.specialty, 'تخصص غير محدد');

    return {
      id: row.id,
      name,
      // Composed from real API fields instead of a hardcoded marketing line.
      tagline: `${degree} — ${specialty}`,
      degree,
      specialty,
      governorate: text(row.governorate, '—'),
      phone: text(row.phone, '—'),
      email: text(row.email, '—'),
      medicalSyndicateId: text(row.medical_syndicate_id, '—'),
      joinedAt: text(row.created_at, ''),
      isOnline: Boolean(row.is_online),
      profileImage: ''
    };
  }

  let doctors = $state<DoctorProfile[]>([]);
  let loadingDoctors = $state(true);
  let doctorsError = $state('');

  // Login hands over the resolved doctor via /doctor-dashboard?id=<uuid> (see
  // submitLogin in src/routes/+page.svelte). Without it the dashboard still
  // opens, falling back to the first row, so the route keeps working when it is
  // visited directly.
  const activeDoctorId = $derived(page.url.searchParams.get('id') ?? '');

  const doctor = $derived(
    (activeDoctorId ? doctors.find((d) => d.id === activeDoctorId) : undefined) ??
      doctors[0] ??
      null
  );

  async function loadDoctors() {
    loadingDoctors = true;
    doctorsError = '';

    try {
      const res = await fetch(DOCTORS_API);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(text(data?.error, `فشل تحميل بيانات الأطباء (${res.status})`));
      }

      const rows: ApiDoctor[] = Array.isArray(data?.doctors) ? data.doctors : [];
      doctors = rows.map(toProfile);

      if (doctors.length === 0) {
        doctorsError = 'لا يوجد أطباء مسجَّلون في قاعدة البيانات بعد.';
      }
    } catch (err) {
      doctors = [];
      doctorsError = err instanceof Error ? err.message : 'تعذّر الاتصال بالخادم';
    } finally {
      loadingDoctors = false;
    }
  }

  $effect(() => {
    loadDoctors();
  });

  // ---------------- Profile picture ----------------

  // The list endpoint omits profile_image (see GetDoctors in server.go), so the
  // picture is fetched per doctor from GET /doctors/:id and cached per id so
  // switching back and forth doesn't refetch the base64 payload.
  let avatarFailed = $state(false);

  const avatarSrc = $derived(doctor?.profileImage && !avatarFailed ? doctor.profileImage : '');

  $effect(() => {
    const id = doctor?.id;
    if (!id || doctor?.profileImage) return;

    avatarFailed = false;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${DOCTORS_API}/${id}`);
        if (!res.ok) return;

        const data = await res.json();
        const img = typeof data?.profile_image === 'string' ? data.profile_image : '';
        if (cancelled) return;

        doctors = doctors.map((d) => (d.id === id ? { ...d, profileImage: img } : d));
      } catch {
        // A missing picture is not a page-level failure: the avatar falls back
        // to the doctor's initial.
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  function handleAvatarError() {
    avatarFailed = true;
  }

  // ---------------- Online status ----------------

  // Seeded from the real API value once the doctor row loads; kept in local
  // state so the toggle is instant (optimistic). The PATCH call syncs the
  // change to the backend and rolls back on failure.
  let isOnline = $state(false);
  let togglingOnline = $state(false);

  // Sync isOnline whenever the resolved doctor changes (e.g. after loadDoctors).
  $effect(() => {
    if (doctor) isOnline = doctor.isOnline;
  });

  async function toggleOnlineStatus() {
    if (!doctor || togglingOnline) return;

    const next = !isOnline;

    // Optimistic update — feels instant to the user.
    isOnline = next;
    togglingOnline = true;

    try {
      const res = await fetch(`${DOCTORS_API}/${doctor.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_online: next })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Keep local state in sync with what the server confirmed.
      isOnline = typeof data.is_online === 'boolean' ? data.is_online : next;

      // Also update the cached doctor list so switching doctors stays correct.
      doctors = doctors.map((d) =>
        d.id === doctor!.id ? { ...d, isOnline } : d
      );
    } catch {
      // Roll back the optimistic update on any failure.
      isOnline = !next;
    } finally {
      togglingOnline = false;
    }
  }

  // ---------------- Pricing ----------------

  type Prices = { chat: number; audio: number; video: number };

  let prices: Prices = $state({
    chat: 200,
    audio: 300,
    video: 400
  });

  const priceServices: { key: keyof Prices; label: string; icon: string }[] = [
    { key: 'chat', label: 'Chat Consultation', icon: 'MessageCircle' },
    { key: 'audio', label: 'Audio Call', icon: 'Phone' },
    { key: 'video', label: 'Video Call', icon: 'Video' }
  ];

  // ---------------- Clinics / Hospitals ----------------

  const WORK_PLACES_API = '/api/work-places';

  // API shape returned by GET /work-places
  interface ApiSchedule {
    id: number;
    work_place_id: string;
    day_of_week: number;   // 0=السبت … 6=الجمعة
    day_name: string;
    is_off: boolean;
    from_time?: string;    // "HH:MM"
    to_time?: string;
  }

  interface ApiWorkPlace {
    id: string;
    doctor_id: string;
    place_type: string;
    name: string;
    address: string;
    phone?: string;
    exam_price?: number;
    schedules?: ApiSchedule[];
  }

  // Local UI types
  type PlaceType = 'عيادة خاصة' | 'مستشفى' | 'مركز طبي' | 'مستوصف';

  interface ClinicSlot {
    id: number;   // local-only counter for keying, not sent to API
    from: string; // "HH:MM"
    to: string;
  }

  interface ClinicDay {
    dayOfWeek: number; // 0–6
    label: string;
    isOff: boolean;
    slots: ClinicSlot[];
  }

  interface Clinic {
    // API-assigned UUID once saved; empty string for new (unsaved) rows
    apiId: string;
    // Stable local key for Svelte {#each} tracking before the row has an apiId
    localId: number;
    type: PlaceType;
    name: string;
    address: string;
    phone: string;
    consultFee: number;
    days: ClinicDay[];
    // true while a save/delete request is in flight for this specific row
    saving: boolean;
    // non-empty when the last save for this row failed
    saveError: string;
  }

  // Day-of-week definitions: 0=السبت … 6=الجمعة (matches the Go API)
  const DAY_META: { dayOfWeek: number; label: string }[] = [
    { dayOfWeek: 0, label: 'السبت'    },
    { dayOfWeek: 1, label: 'الأحد'    },
    { dayOfWeek: 2, label: 'الاثنين'  },
    { dayOfWeek: 3, label: 'الثلاثاء' },
    { dayOfWeek: 4, label: 'الأربعاء' },
    { dayOfWeek: 5, label: 'الخميس'  },
    { dayOfWeek: 6, label: 'الجمعة'  },
  ];

  // Build blank days (all off) for a brand-new clinic
  function blankDays(): ClinicDay[] {
    return DAY_META.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      label: d.label,
      isOff: true,
      slots: []
    }));
  }

  // Convert API schedule rows → local ClinicDay[]
  function schedulesToDays(schedules: ApiSchedule[]): ClinicDay[] {
    // Group by day_of_week
    const byDay = new Map<number, ApiSchedule[]>();
    for (const s of schedules) {
      const arr = byDay.get(s.day_of_week) ?? [];
      arr.push(s);
      byDay.set(s.day_of_week, arr);
    }

    return DAY_META.map((d) => {
      const rows = byDay.get(d.dayOfWeek) ?? [];
      // A day is off when it has no rows OR all rows have is_off = true
      const isOff = rows.length === 0 || rows.every((r) => r.is_off);
      const slots: ClinicSlot[] = isOff
        ? []
        : rows
            .filter((r) => !r.is_off && r.from_time && r.to_time)
            .map((r) => ({ id: ++slotIdCounter, from: r.from_time!, to: r.to_time! }));
      return { dayOfWeek: d.dayOfWeek, label: d.label, isOff, slots };
    });
  }

  // Convert local ClinicDay[] → API schedule input array
  function daysToSchedules(days: ClinicDay[]) {
    const out: { day_of_week: number; is_off: boolean; from_time?: string; to_time?: string }[] = [];
    for (const day of days) {
      if (day.isOff || day.slots.length === 0) {
        out.push({ day_of_week: day.dayOfWeek, is_off: true });
      } else {
        const validSlots = day.slots.filter((slot) => slot.from && slot.to && slot.from < slot.to);
        if (validSlots.length === 0) {
          out.push({ day_of_week: day.dayOfWeek, is_off: true });
        } else {
          for (const slot of validSlots) {
            out.push({ day_of_week: day.dayOfWeek, is_off: false, from_time: slot.from, to_time: slot.to });
          }
        }
      }
    }
    return out;
  }

  // Map API place_type string → local UI PlaceType
  function toLocalType(apiType: string): PlaceType {
    const map: Record<string, PlaceType> = {
      'عيادة خاصة': 'عيادة خاصة',
      'مستشفى':     'مستشفى',
      'مركز طبي':   'مركز طبي',
      'مستوصف':     'مستوصف',
    };
    return map[apiType] ?? 'عيادة خاصة';
  }

  // Map local PlaceType → API place_type string (same values, kept for clarity)
  function toApiType(t: PlaceType): string { return t; }

  function apiToClinic(wp: ApiWorkPlace, localId: number): Clinic {
    return {
      apiId:      wp.id,
      localId,
      type:       toLocalType(wp.place_type),
      name:       wp.name,
      address:    wp.address,
      phone:      wp.phone ?? '',
      consultFee: wp.exam_price ?? 0,
      days:       schedulesToDays(wp.schedules ?? []),
      saving:     false,
      saveError:  '',
    };
  }

  let clinics          = $state<Clinic[]>([]);
  let clinicsLoading   = $state(false);
  let clinicsError     = $state('');
  let slotIdCounter    = 0;
  let localIdCounter   = $state(1);

  // expanded / collapsed per localId
  let expandedClinicIds = $state<number[]>([]);

  // Load work places from the API whenever the resolved doctor changes
  $effect(() => {
    const id = doctor?.id;
    if (!id) return;

    clinicsLoading = true;
    clinicsError   = '';

    (async () => {
      try {
        const res  = await fetch(`${WORK_PLACES_API}?doctor_id=${encodeURIComponent(id)}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data?.error ?? `فشل تحميل أماكن العمل (${res.status})`);

        const rows: ApiWorkPlace[] = Array.isArray(data?.work_places) ? data.work_places : [];
        let counter = localIdCounter;
        clinics = rows.map((wp) => apiToClinic(wp, counter++));
        localIdCounter = counter;

        // auto-expand the first clinic for convenience
        if (clinics.length > 0) expandedClinicIds = [clinics[0].localId];
      } catch (err) {
        clinicsError = err instanceof Error ? err.message : 'تعذّر تحميل أماكن العمل';
      } finally {
        clinicsLoading = false;
      }
    })();
  });

  function toggleClinicExpand(localId: number) {
    expandedClinicIds = expandedClinicIds.includes(localId)
      ? expandedClinicIds.filter((x) => x !== localId)
      : [...expandedClinicIds, localId];
  }

  // Add a blank unsaved clinic row locally (saved on "حفظ الإعدادات")
  function addClinic() {
    const localId = ++localIdCounter;
    clinics = [
      ...clinics,
      {
        apiId:      '',
        localId,
        type:       'عيادة خاصة',
        name:       '',
        address:    '',
        phone:      '',
        consultFee: 0,
        days:       blankDays(),
        saving:     false,
        saveError:  '',
      }
    ];
    expandedClinicIds = [...expandedClinicIds, localId];
  }

  // Delete from API if saved, then remove locally
  async function removeClinic(localId: number) {
    const clinic = clinics.find((c) => c.localId === localId);
    if (!clinic) return;

    // Not yet saved → just drop it locally
    if (!clinic.apiId) {
      clinics = clinics.filter((c) => c.localId !== localId);
      expandedClinicIds = expandedClinicIds.filter((x) => x !== localId);
      return;
    }

    // Mark as saving to disable the button
    clinics = clinics.map((c) => c.localId === localId ? { ...c, saving: true, saveError: '' } : c);

    try {
      const res  = await fetch(`${WORK_PLACES_API}/${clinic.apiId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `فشل الحذف (${res.status})`);

      clinics           = clinics.filter((c) => c.localId !== localId);
      expandedClinicIds = expandedClinicIds.filter((x) => x !== localId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر حذف المكان';
      clinics = clinics.map((c) => c.localId === localId ? { ...c, saving: false, saveError: msg } : c);
    }
  }

  function updateClinicField<K extends keyof Clinic>(localId: number, field: K, value: Clinic[K]) {
    clinics = clinics.map((c) => (c.localId === localId ? { ...c, [field]: value } : c));
  }

  function toggleClinicDay(localId: number, dayOfWeek: number) {
    clinics = clinics.map((c) => {
      if (c.localId !== localId) return c;
      return {
        ...c,
        days: c.days.map((d) => {
          if (d.dayOfWeek !== dayOfWeek) return d;
          const nowOff = !d.isOff;
          return {
            ...d,
            isOff: nowOff,
            slots: nowOff ? [] : [{ id: ++slotIdCounter, from: '09:00', to: '17:00' }]
          };
        })
      };
    });
  }

  function addSlot(localId: number, dayOfWeek: number) {
    clinics = clinics.map((c) => {
      if (c.localId !== localId) return c;
      return {
        ...c,
        days: c.days.map((d) => {
          if (d.dayOfWeek !== dayOfWeek || d.isOff) return d;
          return { ...d, slots: [...d.slots, { id: ++slotIdCounter, from: '09:00', to: '17:00' }] };
        })
      };
    });
  }

  function removeSlot(localId: number, dayOfWeek: number, slotId: number) {
    clinics = clinics.map((c) => {
      if (c.localId !== localId) return c;
      return {
        ...c,
        days: c.days.map((d) => {
          if (d.dayOfWeek !== dayOfWeek) return d;
          const newSlots = d.slots.filter((s) => s.id !== slotId);
          return { ...d, slots: newSlots, isOff: newSlots.length === 0 };
        })
      };
    });
  }

  function formatTime(time24: string) {
    if (!time24 || !time24.includes(':')) return '';
    const [h, m] = time24.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // Save a single clinic to the API (create or update) then persist its schedules
  async function saveClinic(clinic: Clinic): Promise<ClinicDay[]> {
    if (!doctor?.id) throw new Error('لم يتم تحديد الطبيب');

    // Always read the latest state — the passed `clinic` may be a stale snapshot
    const latest = clinics.find((c) => c.localId === clinic.localId) ?? clinic;

    const body = {
      doctor_id:  doctor.id,
      place_type: toApiType(latest.type),
      name:       latest.name.trim(),
      address:    latest.address.trim(),
      phone:      latest.phone.trim(),
      exam_price: latest.consultFee || null,
    };

    let apiId = latest.apiId;

    if (!apiId) {
      // Create
      const res  = await fetch(WORK_PLACES_API, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `فشل الإنشاء (${res.status})`);
      apiId = (data?.work_place as ApiWorkPlace)?.id ?? '';
      if (!apiId) throw new Error('لم يُرجع السيرفر معرّف المكان');
      // Persist the new apiId immediately so Delete works if Save fails below
      clinics = clinics.map((c) => c.localId === latest.localId ? { ...c, apiId } : c);
    } else {
      // Update
      const res  = await fetch(`${WORK_PLACES_API}/${apiId}`, {
        method:  'PUT',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ place_type: body.place_type, name: body.name, address: body.address, phone: body.phone, exam_price: body.exam_price }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `فشل التحديث (${res.status})`);
    }

    // Re-read latest days right before building the payload (user may have edited after loop started)
    const currentDays = (clinics.find((c) => c.localId === latest.localId) ?? latest).days;
    const schedPayload = { schedules: daysToSchedules(currentDays) };
    const schedRes = await fetch(`${WORK_PLACES_API}/${apiId}/schedules`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(schedPayload),
    });
    const schedData = await schedRes.json();
    if (!schedRes.ok) throw new Error(schedData?.error ?? `فشل حفظ المواعيد (${schedRes.status})`);

    // Return updated days from server response so UI stays in sync
    return schedulesToDays((schedData?.schedules as ApiSchedule[]) ?? []);
  }

  // ---------------- Today's stats ----------------

  const todayStats = {
    revenue: 2_800,
    waitingPatients: 3,
    newReviews: 5,
    completedToday: 7
  };

  // ---------------- Pending notifications ----------------

  type NotifType = 'instant' | 'scheduled' | 'review';

  interface Notification {
    id: number;
    type: NotifType;
    patientName: string;
    time: string;
    read: boolean;
  }

  let notifications = $state<Notification[]>([
    { id: 1, type: 'instant', patientName: 'سارة أحمد', time: 'منذ 3 دقائق', read: false },
    { id: 2, type: 'scheduled', patientName: 'محمد خالد', time: 'غداً الساعة 6:00 م', read: false },
    { id: 3, type: 'review', patientName: 'رنا سمير', time: 'منذ ساعة', read: true }
  ]);

  let showNotifications = $state(false);

  const unreadCount = $derived(notifications.filter((n) => !n.read).length);

  function markAllRead() {
    notifications = notifications.map((n) => ({ ...n, read: true }));
  }

  function dismissNotif(id: number) {
    notifications = notifications.filter((n) => n.id !== id);
  }

  // ---------------- Patients list ----------------

  type PatientStatus = 'waiting' | 'active' | 'done' | 'scheduled';

  interface ChatMessage {
    id: number;
    from: 'doctor' | 'patient';
    text: string;
    time: string;
  }

  interface Patient {
    id: number;
    name: string;
    initials: string;
    age: number;
    complaint: string;
    status: PatientStatus;
    consultType: 'chat' | 'audio' | 'video';
    waitSince: string;
    messages: ChatMessage[];
  }

  let patients = $state<Patient[]>([
    {
      id: 1,
      name: 'سارة أحمد علي',
      initials: 'سأ',
      age: 28,
      complaint: 'آلام أسفل البطن منذ يومين',
      status: 'waiting',
      consultType: 'chat',
      waitSince: 'منذ 5 دقائق',
      messages: [
        { id: 1, from: 'patient', text: 'السلام عليكم دكتور، أعاني من آلام حادة في أسفل البطن منذ يومين ولا أعرف سببها', time: '4:52 م' },
        { id: 2, from: 'patient', text: 'الألم يزداد بالليل وعندي إفرازات غير طبيعية', time: '4:53 م' }
      ]
    },
    {
      id: 2,
      name: 'منى محمود حسن',
      initials: 'مم',
      age: 34,
      complaint: 'متابعة ما بعد الولادة',
      status: 'active',
      consultType: 'video',
      waitSince: 'منذ 18 دقيقة',
      messages: [
        { id: 1, from: 'patient', text: 'دكتور أنا ولدت منذ 3 أسابيع وعندي بعض الأسئلة عن الرضاعة', time: '4:30 م' },
        { id: 2, from: 'doctor', text: 'أهلاً منى، تفضلي اسأليني وأنا في خدمتك', time: '4:31 م' },
        { id: 3, from: 'patient', text: 'الطفل لا يرضع بشكل كافٍ وأنا قلقة جداً، هل هذا طبيعي؟', time: '4:33 م' },
        { id: 4, from: 'doctor', text: 'هذا وارد في الأسابيع الأولى. كمية الرضاعة ستزيد تدريجياً مع الوقت. تأكدي أن وضعية الإمساك صحيحة ورضعي كل 2-3 ساعات', time: '4:35 م' }
      ]
    },
    {
      id: 3,
      name: 'هنا كريم سعيد',
      initials: 'هك',
      age: 22,
      complaint: 'تأخر الدورة الشهرية',
      status: 'waiting',
      consultType: 'chat',
      waitSince: 'منذ 12 دقيقة',
      messages: [
        { id: 1, from: 'patient', text: 'دكتور دورتي تأخرت 3 أسابيع وعمل تحليل حمل طلع سلبي، ما السبب؟', time: '4:46 م' }
      ]
    },
    {
      id: 4,
      name: 'ريم عبدالله فاروق',
      initials: 'رع',
      age: 31,
      complaint: 'استشارة ما قبل الحمل',
      status: 'done',
      consultType: 'audio',
      waitSince: 'منذ ساعة',
      messages: [
        { id: 1, from: 'patient', text: 'دكتور أنا أخطط للحمل وأريد نصائح قبل البدء', time: '3:00 م' },
        { id: 2, from: 'doctor', text: 'أهلاً بك، ننصح بأخذ حمض الفوليك قبل الحمل بـ 3 أشهر، وعمل تحاليل شاملة', time: '3:02 م' },
        { id: 3, from: 'patient', text: 'شكراً جزيلاً دكتور، سأتبع نصائحك', time: '3:15 م' },
        { id: 4, from: 'doctor', text: 'بالتوفيق إن شاء الله، لا تترددي في التواصل', time: '3:16 م' }
      ]
    },
    {
      id: 5,
      name: 'دينا يوسف ناصر',
      initials: 'دي',
      age: 26,
      complaint: 'آلام أثناء الدورة',
      status: 'scheduled',
      consultType: 'chat',
      waitSince: 'غداً 7:00 م',
      messages: []
    }
  ]);

  // patients filter + شات state
  let patientsFilter = $state<'all' | PatientStatus>('all');
  let activeChatPatient = $state<Patient | null>(null);
  let chatInput = $state('');
  let chatBodyEl = $state<HTMLElement | null>(null);

  function openChat(patient: Patient) {
    activeChatPatient = patient;
    chatInput = '';
    // scroll to bottom after render
    setTimeout(() => {
      if (chatBodyEl) chatBodyEl.scrollTop = chatBodyEl.scrollHeight;
    }, 50);
  }

  function closeChat() {
    activeChatPatient = null;
  }

  function sendMessage() {
    const text = chatInput.trim();
    if (!text || !activeChatPatient) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // push into the patient's messages array
    patients = patients.map((p) => {
      if (p.id !== activeChatPatient!.id) return p;
      return {
        ...p,
        messages: [...p.messages, { id: Date.now(), from: 'doctor', text, time: timeStr }]
      };
    });

    // keep activeChatPatient in sync
    activeChatPatient = patients.find((p) => p.id === activeChatPatient!.id) ?? null;
    chatInput = '';

    setTimeout(() => {
      if (chatBodyEl) chatBodyEl.scrollTop = chatBodyEl.scrollHeight;
    }, 30);
  }

  function handleChatKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const statusLabel: Record<PatientStatus, string> = {
    waiting: 'في الانتظار',
    active: 'جارية',
    done: 'مكتملة',
    scheduled: 'مجدولة'
  };

  const consultTypeIcon: Record<Patient['consultType'], string> = {
    chat: 'MessageCircle',
    audio: 'Phone',
    video: 'Video'
  };

  // ----------------------------------------------------------------
  // Save all clinics + reload on success

  let saving = $state(false);
  let savedJustNow = $state(false);
  let saveError = $state('');

  async function saveSettings() {
    if (saving || !doctor?.id) return;
    saving    = true;
    saveError = '';

    // Clear per-row errors
    clinics = clinics.map((c) => ({ ...c, saveError: '' }));

    let anyFailed = false;

    for (const clinic of clinics) {
      if (!clinic.name.trim() || !clinic.address.trim()) {
        clinics = clinics.map((c) =>
          c.localId === clinic.localId
            ? { ...c, saveError: 'اسم المكان والعنوان مطلوبان' }
            : c
        );
        anyFailed = true;
        continue;
      }

      clinics = clinics.map((c) => c.localId === clinic.localId ? { ...c, saving: true } : c);

      try {
        const updatedDays = await saveClinic(clinic);
        clinics = clinics.map((c) => c.localId === clinic.localId ? { ...c, saving: false, saveError: '', days: updatedDays } : c);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'تعذّر الحفظ';
        clinics   = clinics.map((c) => c.localId === clinic.localId ? { ...c, saving: false, saveError: msg } : c);
        anyFailed = true;
      }
    }

    saving = false;

    if (!anyFailed) {
      savedJustNow = true;
      setTimeout(() => (savedJustNow = false), 2400);
    } else {
      saveError = 'بعض الأماكن لم تُحفظ — راجع الأخطاء أدناه';
    }
  }

  // Re-load from the API to discard all unsaved local changes
  async function cancelChanges() {
    if (!doctor?.id || saving) return;
    clinicsLoading = true;
    clinicsError   = '';
    try {
      const res  = await fetch(`${WORK_PLACES_API}?doctor_id=${encodeURIComponent(doctor.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `فشل التحميل (${res.status})`);
      const rows: ApiWorkPlace[] = Array.isArray(data?.work_places) ? data.work_places : [];
      let counter = 1;
      clinics = rows.map((wp) => apiToClinic(wp, counter++));
      localIdCounter = counter;
      if (clinics.length > 0) expandedClinicIds = [clinics[0].localId];
      else expandedClinicIds = [];
    } catch (err) {
      clinicsError = err instanceof Error ? err.message : 'تعذّر إعادة التحميل';
    } finally {
      clinicsLoading = false;
    }
  }
</script>

<svelte:head>
  <title>لوحة الطبيب — Medical Care</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Markazi+Text:wght@500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="doctor-app">

  <!-- Header -->
  <header class="navbar">
    <div class="container nav-content">

      <a href="#home" class="logo">
        <div class="logo-icon">
          <Stethoscope size={22} />
        </div>
        <div>
          <h2>Medical Care</h2>
          <span>لوحة تحكم الطبيب</span>
        </div>
      </a>

      <a href="/" class="back-link" onclick={(e) => { e.preventDefault(); goto('/'); }}>
  <ArrowLeft size={16} class="flip-rtl" />
  رجوع للرئيسية
</a>

    </div>
  </header>


  <main class="container page-body">

    <!-- Profile header -->
    <section class="profile-card">

      {#if loadingDoctors}
        <div class="profile-state">
          <div class="spinner" aria-hidden="true"></div>
          <p>جارٍ تحميل بيانات الطبيب…</p>
        </div>
      {:else if doctorsError}
        <div class="profile-state profile-state-error">
          <AlertCircle size={20} />
          <p>{doctorsError}</p>
          <button class="profile-retry" onclick={loadDoctors}>إعادة المحاولة</button>
        </div>
      {:else if doctor}
        <div class="profile-main">

          <div class="profile-avatar">
            {#if avatarSrc}
              <img src={avatarSrc} alt={doctor.name} onerror={handleAvatarError} />
            {:else}
              {doctor.name.charAt(0) || 'د'}
            {/if}
            <span class="avatar-badge" class:online={isOnline}>
              <i></i>
            </span>
          </div>

          <div class="profile-info">

            <div class="profile-name-row">
              <h1>{doctor.name}</h1>
              <span class="verified-pill">
                <ShieldCheck size={14} />
                طبيب موثق
              </span>
            </div>

            <p class="profile-tagline">{doctor.tagline}</p>

            <p class="profile-meta">
              {doctor.degree}
              <span class="dot">•</span>
              {doctor.specialty}
              <span class="dot">•</span>
              {doctor.governorate}
            </p>

            <div class="profile-stats">

              <div class="stat">
                <BadgeCheck size={16} />
                <span>رقم النقابة:</span>
                <strong>{doctor.medicalSyndicateId}</strong>
              </div>

              <div class="stat">
                <Phone size={16} />
                <span>الهاتف:</span>
                <strong>{doctor.phone}</strong>
              </div>

            </div>

          </div>

        </div>
      {/if}


      <div class="online-toggle-box">

        <div class="online-toggle-text">
          <strong>{isOnline ? 'أنت أونلاين متصل' : 'أنت غير متصل حاليًا'}</strong>
          <span class:available={isOnline}>
            {isOnline ? '🟢 متاح للاستشارة الفورية' : 'لن تصلك طلبات استشارة فورية'}
          </span>
        </div>

        <button
          class="switch"
          class:on={isOnline}
          role="switch"
          aria-checked={isOnline}
          aria-label="تفعيل حالة الاتصال"
          disabled={togglingOnline || !doctor}
          onclick={toggleOnlineStatus}
        >
          <span class="switch-thumb"></span>
        </button>

      </div>

    </section>


    <!-- ===== TODAY'S STATS ===== -->
    <section class="stats-row">

      <div class="stat-card">
        <div class="stat-card-icon revenue">
          <Wallet size={20} />
        </div>
        <div>
          <span class="stat-card-label">إيرادات اليوم</span>
          <strong class="stat-card-value">{todayStats.revenue.toLocaleString('ar-EG')} ج.م</strong>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-card-icon waiting">
          <Users size={20} />
        </div>
        <div>
          <span class="stat-card-label">ينتظرون الآن</span>
          <strong class="stat-card-value">{todayStats.waitingPatients} مرضى</strong>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-card-icon completed">
          <CheckCircle2 size={20} />
        </div>
        <div>
          <span class="stat-card-label">مكتملة اليوم</span>
          <strong class="stat-card-value">{todayStats.completedToday} استشارة</strong>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-card-icon reviews">
          <Star size={20} />
        </div>
        <div>
          <span class="stat-card-label">تقييمات جديدة</span>
          <strong class="stat-card-value">{todayStats.newReviews} تقييم</strong>
        </div>
      </div>

    </section>


    <!-- ===== NOTIFICATIONS ===== -->
    <section class="panel notif-panel">

      <button class="notif-header" onclick={() => (showNotifications = !showNotifications)}>
        <div class="panel-header-icon">
          <Bell size={20} />
        </div>
        <div class="notif-header-text">
          <h3>الإشعارات والطلبات المعلقة</h3>
          <p>اطلع على آخر طلبات الاستشارة والتقييمات</p>
        </div>
        {#if unreadCount > 0}
          <span class="notif-badge">{unreadCount}</span>
        {/if}
        <span class="notif-chevron">
          {#if showNotifications}
            <ChevronUp size={18} />
          {:else}
            <ChevronDown size={18} />
          {/if}
        </span>
      </button>

      {#if showNotifications}
        <div class="notif-body">

          {#if notifications.length === 0}
            <p class="notif-empty">لا توجد إشعارات حالياً 🎉</p>
          {:else}
            {#if unreadCount > 0}
              <button class="mark-read-btn" onclick={markAllRead}>تحديد الكل كمقروء</button>
            {/if}

            <ul class="notif-list">
              {#each notifications as notif (notif.id)}
                <li class="notif-item" class:unread={!notif.read}>

                  <span class="notif-type-icon" class:instant={notif.type === 'instant'} class:scheduled={notif.type === 'scheduled'} class:review={notif.type === 'review'}>
                    {#if notif.type === 'instant'}
                      <AlertCircle size={16} />
                    {:else if notif.type === 'scheduled'}
                      <CalendarDays size={16} />
                    {:else}
                      <Star size={16} />
                    {/if}
                  </span>

                  <div class="notif-text">
                    <strong>
                      {notif.type === 'instant' ? 'طلب فوري من' : notif.type === 'scheduled' ? 'حجز مجدول مع' : 'تقييم جديد من'}
                      {notif.patientName}
                    </strong>
                    <span>{notif.time}</span>
                  </div>

                  <button class="notif-dismiss" aria-label="إغلاق" onclick={() => dismissNotif(notif.id)}>
                    <X size={14} />
                  </button>

                </li>
              {/each}
            </ul>
          {/if}

        </div>
      {/if}

    </section>



    <!-- ===== PATIENTS LIST ===== -->
    <section class="panel patients-panel">

      <div class="panel-header">
        <div class="panel-header-icon">
          <Inbox size={20} />
        </div>
        <div>
          <h3>قائمة المرضى</h3>
          <p>استعرض مرضى اليوم، افتح المحادثة أو تابع الحالة</p>
        </div>
      </div>

      <!-- filter tabs -->
      <div class="patients-tabs" role="tablist">
        {#each (['all','waiting','active','done','scheduled'] as const) as key}
          <button
            role="tab"
            class="ptab"
            class:active={patientsFilter === key}
            onclick={() => (patientsFilter = key)}
          >
            {key === 'all' ? 'الكل' : statusLabel[key as PatientStatus]}
            <span class="ptab-count">
              {key === 'all' ? patients.length : patients.filter(p => p.status === key).length}
            </span>
          </button>
        {/each}
      </div>

      <!-- table -->
      <ul class="patients-list">
        {#each patients.filter(p => patientsFilter === 'all' || p.status === patientsFilter) as patient (patient.id)}
          <li class="patient-row status-{patient.status}">

            <!-- avatar -->
            <div class="patient-avatar" aria-hidden="true">{patient.initials}</div>

            <!-- info -->
            <div class="patient-info">
              <div class="patient-name-row">
                <strong>{patient.name}</strong>
                <span class="patient-age">{patient.age} سنة</span>
              </div>
              <p class="patient-complaint">{patient.complaint}</p>
              <div class="patient-meta">
                <span class="consult-type-badge consult-{patient.consultType}">
                  {#if patient.consultType === 'chat'}
                    <MessageCircle size={12} />
                  {:else if patient.consultType === 'audio'}
                    <Phone size={12} />
                  {:else}
                    <Video size={12} />
                  {/if}
                  {patient.consultType === 'chat' ? 'شات' : patient.consultType === 'audio' ? 'صوتي' : 'فيديو'}
                </span>
                <span class="patient-wait">
                  <ClockIcon size={12} />
                  {patient.waitSince}
                </span>
              </div>
            </div>

            <!-- status pill -->
            <span class="status-pill status-pill-{patient.status}">
              {statusLabel[patient.status]}
            </span>

            <!-- actions -->
            <div class="patient-actions">
              {#if patient.status !== 'done'}
                <button
                  class="chat-open-btn"
                  onclick={() => openChat(patient)}
                  aria-label="فتح محادثة مع {patient.name}"
                >
                  <MessageCircle size={16} />
                  فتح الشات
                  {#if patient.messages.filter(m => m.from === 'patient').length > 0 && patient.status === 'waiting'}
                    <span class="chat-unread-dot"></span>
                  {/if}
                </button>
              {:else}
                <button
                  class="chat-view-btn"
                  onclick={() => openChat(patient)}
                  aria-label="عرض محادثة {patient.name}"
                >
                  عرض السجل
                </button>
              {/if}
            </div>

          </li>
        {/each}

        {#if patients.filter(p => patientsFilter === 'all' || p.status === patientsFilter).length === 0}
          <li class="patients-empty">
            <UserRound size={32} />
            <span>لا يوجد مرضى في هذا القسم</span>
          </li>
        {/if}
      </ul>

    </section>


    <!-- Settings heading -->
    <div class="settings-heading">
      <h2>إعدادات مواعيد العمل والأسعار</h2>
      <p>تخصيص أيام وساعات العمل، مدة الكشف، وتسعير الخدمات</p>
    </div>


    <!-- Pricing -->
    <section class="panel">

      <div class="panel-header">
        <div class="panel-header-icon">
          <Wallet size={20} />
        </div>
        <div>
          <h3>تحديد أسعار الخدمات (جنيه مصري - EGP)</h3>
          <p>يحق للطبيب تحديد سعر كل خدمة بنفسه</p>
        </div>
      </div>

      <div class="price-grid">

        {#each priceServices as service}
          <div class="price-card">

            <div class="price-card-head">
              <span class="price-icon">
                {#if service.icon === 'MessageCircle'}
                  <MessageCircle size={18} />
                {:else if service.icon === 'Phone'}
                  <Phone size={18} />
                {:else if service.icon === 'Video'}
                  <Video size={18} />
                {/if}
              </span>
              <span class="price-label">{service.label}</span>
            </div>

            <div class="price-input-row">
              <input
                type="number"
                min="0"
                step="10"
                bind:value={prices[service.key]}
              />
              <span class="currency">ج.م</span>
            </div>

          </div>
        {/each}

      </div>

    </section>





    <!-- ===== CLINICS / HOSPITALS ===== -->
    <section class="panel clinics-panel">

      <div class="panel-header">
        <div class="panel-header-icon">
          <MapPin size={20} />
        </div>
        <div>
          <h3>العيادات والمستشفيات</h3>
          <p>أضف أماكن عملك وحدد مواعيد الكشف لكل يوم</p>
        </div>
        <button class="add-clinic-btn" onclick={addClinic} aria-label="إضافة عيادة أو مستشفى">
          <Plus size={16} />
          إضافة مكان
        </button>
      </div>

      {#if clinicsLoading}
        <div class="clinics-empty">
          <div class="spinner" aria-hidden="true"></div>
          <p>جارٍ تحميل أماكن العمل…</p>
        </div>
      {:else if clinicsError}
        <div class="clinics-empty">
          <AlertCircle size={28} />
          <p>{clinicsError}</p>
        </div>
      {:else if clinics.length === 0}
        <div class="clinics-empty">
          <Building2 size={36} />
          <p>لم تُضف أي عيادة أو مستشفى بعد</p>
          <button class="add-clinic-btn" onclick={addClinic}>
            <Plus size={15} />
            إضافة أول مكان
          </button>
        </div>
      {:else}
        <div class="clinics-list">
          {#each clinics as clinic (clinic.localId)}
            <div class="clinic-card" class:expanded={expandedClinicIds.includes(clinic.localId)}>

              <!-- clinic header row -->
              <div class="clinic-card-head">

                <span class="clinic-type-badge" class:hospital={clinic.type === 'مستشفى' || clinic.type === 'مركز طبي'}>
                  {#if clinic.type === 'مستشفى' || clinic.type === 'مركز طبي'}
                    <Building2 size={13} />
                    {clinic.type}
                  {:else}
                    <MapPin size={13} />
                    {clinic.type}
                  {/if}
                </span>

                <div class="clinic-head-info">
                  <strong>{clinic.name || 'مكان جديد'}</strong>
                  {#if clinic.address}
                    <span>{clinic.address}</span>
                  {/if}
                  {#if !clinic.apiId}
                    <span class="clinic-unsaved-badge">غير محفوظ</span>
                  {/if}
                </div>

                <div class="clinic-head-actions">
                  <button
                    class="clinic-expand-btn"
                    onclick={() => toggleClinicExpand(clinic.localId)}
                    aria-expanded={expandedClinicIds.includes(clinic.localId)}
                    aria-label="توسيع تفاصيل العيادة"
                  >
                    {#if expandedClinicIds.includes(clinic.localId)}
                      <ChevronUp size={17} />
                    {:else}
                      <ChevronDown size={17} />
                    {/if}
                  </button>
                  <button
                    class="clinic-remove-btn"
                    disabled={clinic.saving}
                    onclick={() => removeClinic(clinic.localId)}
                    aria-label="حذف هذا المكان"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

              </div>

              <!-- per-row save error -->
              {#if clinic.saveError}
                <div class="clinic-row-error">
                  <AlertCircle size={14} />
                  {clinic.saveError}
                </div>
              {/if}

              <!-- expandable body -->
              {#if expandedClinicIds.includes(clinic.localId)}
                <div class="clinic-body">

                  <!-- basic info fields -->
                  <div class="clinic-fields">

                    <div class="clinic-field">
                      <label for="clinic-type-{clinic.localId}">نوع المكان</label>
                      <select
                        id="clinic-type-{clinic.localId}"
                        value={clinic.type}
                        onchange={(e) => updateClinicField(clinic.localId, 'type', (e.target as HTMLSelectElement).value as PlaceType)}
                      >
                        <option value="عيادة خاصة">عيادة خاصة</option>
                        <option value="مستشفى">مستشفى</option>
                        <option value="مركز طبي">مركز طبي</option>
                        <option value="مستوصف">مستوصف</option>
                      </select>
                    </div>

                    <div class="clinic-field">
                      <label for="clinic-name-{clinic.localId}">اسم المكان</label>
                      <input
                        id="clinic-name-{clinic.localId}"
                        type="text"
                        placeholder="مثال: عيادة دكتور أحمد"
                        value={clinic.name}
                        oninput={(e) => updateClinicField(clinic.localId, 'name', (e.target as HTMLInputElement).value)}
                      />
                    </div>

                    <div class="clinic-field clinic-field-wide">
                      <label for="clinic-address-{clinic.localId}">العنوان</label>
                      <input
                        id="clinic-address-{clinic.localId}"
                        type="text"
                        placeholder="المحافظة، الحي، اسم الشارع"
                        value={clinic.address}
                        oninput={(e) => updateClinicField(clinic.localId, 'address', (e.target as HTMLInputElement).value)}
                      />
                    </div>

                    <div class="clinic-field">
                      <label for="clinic-phone-{clinic.localId}">رقم التليفون</label>
                      <input
                        id="clinic-phone-{clinic.localId}"
                        type="tel"
                        placeholder="01x xxxx xxxx"
                        value={clinic.phone}
                        oninput={(e) => updateClinicField(clinic.localId, 'phone', (e.target as HTMLInputElement).value)}
                      />
                    </div>

                    <div class="clinic-field">
                      <label for="clinic-fee-{clinic.localId}">سعر الكشف (ج.م)</label>
                      <div class="clinic-fee-wrap">
                        <input
                          id="clinic-fee-{clinic.localId}"
                          type="number"
                          min="0"
                          step="50"
                          value={clinic.consultFee}
                          oninput={(e) => updateClinicField(clinic.localId, 'consultFee', Number((e.target as HTMLInputElement).value))}
                        />
                        <span>ج.م</span>
                      </div>
                    </div>

                  </div>

                  <!-- weekly schedule for this clinic -->
                  <div class="clinic-schedule">

                    <h4 class="clinic-schedule-title">
                      <Clock size={15} />
                      مواعيد الكشف الأسبوعية
                    </h4>

                    <div class="clinic-days-list">
                      {#each clinic.days as day (day.dayOfWeek)}
                        <div class="clinic-day-row" class:is-off={day.isOff}>

                          <!-- day toggle + label -->
                          <div class="clinic-day-label">
                            <button
                              class="switch small"
                              class:on={!day.isOff}
                              role="switch"
                              aria-checked={!day.isOff}
                              aria-label={`تفعيل يوم ${day.label}`}
                              onclick={() => toggleClinicDay(clinic.localId, day.dayOfWeek)}
                            >
                              <span class="switch-thumb"></span>
                            </button>
                            <strong>{day.label}</strong>
                          </div>

                          <!-- slots or off tag -->
                          {#if day.isOff}
                            <span class="schedule-off-tag">يوم عطلة / غير متاح</span>
                          {:else}
                            <div class="clinic-slots">
                              {#each day.slots as slot (slot.id)}
                                <div class="clinic-slot">
                                  <label>
                                    <span>من</span>
                                    <input
                                      type="time"
                                      bind:value={slot.from}
                                    />
                                    <small>{formatTime(slot.from)}</small>
                                  </label>
                                  <label>
                                    <span>إلى</span>
                                    <input
                                      type="time"
                                      bind:value={slot.to}
                                      min={slot.from}
                                    />
                                    <small>{formatTime(slot.to)}</small>
                                  </label>
                                  {#if day.slots.length > 1}
                                    <button
                                      class="slot-remove-btn"
                                      onclick={() => removeSlot(clinic.localId, day.dayOfWeek, slot.id)}
                                      aria-label="حذف هذا الميعاد"
                                    >
                                      <X size={13} />
                                    </button>
                                  {/if}
                                </div>
                              {/each}

                              <button
                                class="slot-add-btn"
                                onclick={() => addSlot(clinic.localId, day.dayOfWeek)}
                                aria-label="إضافة فترة أخرى"
                              >
                                <Plus size={13} />
                                فترة أخرى
                              </button>
                            </div>
                          {/if}

                        </div>
                      {/each}
                    </div>

                  </div>

                </div>
              {/if}

            </div>
          {/each}
        </div>
      {/if}

    </section>




    <!-- Footer actions -->
    <div class="page-actions">

      {#if savedJustNow}
        <span class="saved-hint">
          <CheckCircle2 size={16} />
          تم حفظ الإعدادات بنجاح
        </span>
      {:else if saveError}
        <span class="saved-hint save-error-hint">
          <AlertCircle size={16} />
          {saveError}
        </span>
      {/if}

      <div class="page-actions-buttons">

        <button class="outline-btn" onclick={cancelChanges}>
          <X size={17} />
          إلغاء
        </button>

        <button class="primary-btn" disabled={saving} onclick={saveSettings}>
          <Save size={17} />
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات والمواعيد'}
        </button>

      </div>

    </div>

  </main>

</div>

<!-- ===== CHAT OVERLAY ===== -->
{#if activeChatPatient}
  <!-- backdrop -->
  <div
    class="chat-backdrop"
    role="button"
    tabindex="-1"
    aria-label="إغلاق المحادثة"
    onclick={closeChat}
    onkeydown={(e) => e.key === 'Escape' && closeChat()}
  ></div>

  <div class="chat-window" role="dialog" aria-modal="true" aria-label="محادثة مع {activeChatPatient.name}">

    <!-- chat header -->
    <div class="chat-header">

      <div class="chat-header-avatar" aria-hidden="true">
        {activeChatPatient.initials}
        <span class="chat-avatar-dot" class:online-dot={activeChatPatient.status === 'active'}></span>
      </div>

      <div class="chat-header-info">
        <strong>{activeChatPatient.name}</strong>
        <span>
          {activeChatPatient.age} سنة
          <span class="dot">•</span>
          {activeChatPatient.complaint}
        </span>
      </div>

      <div class="chat-header-actions">
        {#if activeChatPatient.consultType === 'audio' || activeChatPatient.consultType === 'video'}
          <button class="chat-icon-btn" aria-label="مكالمة صوتية">
            <PhoneCall size={17} />
          </button>
        {/if}
        {#if activeChatPatient.consultType === 'video'}
          <button class="chat-icon-btn" aria-label="مكالمة فيديو">
            <VideoIcon size={17} />
          </button>
        {/if}
        <button class="chat-icon-btn" aria-label="خيارات أخرى">
          <MoreVertical size={17} />
        </button>
        <button class="chat-close-btn" onclick={closeChat} aria-label="إغلاق">
          <X size={19} />
        </button>
      </div>

    </div>

    <!-- status banner -->
    <div class="chat-status-bar status-bar-{activeChatPatient.status}">
      <span class="status-pill status-pill-{activeChatPatient.status}">
        {statusLabel[activeChatPatient.status]}
      </span>
      <span class="chat-wait-label">
        <ClockIcon size={13} />
        {activeChatPatient.waitSince}
      </span>
    </div>

    <!-- messages body -->
    <div class="chat-body" bind:this={chatBodyEl}>

      {#if activeChatPatient.messages.length === 0}
        <div class="chat-empty">
          <MessageCircle size={36} />
          <p>لا توجد رسائل بعد.<br/>ابدأ المحادثة مع المريض.</p>
        </div>
      {:else}
        <div class="chat-messages">
          {#each activeChatPatient.messages as msg (msg.id)}
            <div class="msg-wrap" class:msg-doctor={msg.from === 'doctor'} class:msg-patient={msg.from === 'patient'}>
              {#if msg.from === 'patient'}
                <div class="msg-avatar-sm" aria-hidden="true">{activeChatPatient.initials}</div>
              {:else}
                <div class="msg-avatar-sm msg-avatar-doctor" aria-hidden="true">د</div>
              {/if}
              <div class="msg-bubble">
                <p>{msg.text}</p>
                <time>{msg.time}</time>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    </div>

    <!-- input bar -->
    {#if activeChatPatient.status !== 'done'}
      <div class="chat-input-bar">
        <button class="chat-attach-btn" aria-label="إرفاق ملف">
          <Paperclip size={18} />
        </button>
        <textarea
          class="chat-textarea"
          placeholder="اكتب ردك هنا... (Enter للإرسال)"
          rows="1"
          bind:value={chatInput}
          onkeydown={handleChatKey}
        ></textarea>
        <button
          class="chat-send-btn"
          class:ready={chatInput.trim().length > 0}
          onclick={sendMessage}
          aria-label="إرسال"
          disabled={chatInput.trim().length === 0}
        >
          <Send size={18} />
        </button>
      </div>
    {:else}
      <div class="chat-done-bar">
        <CheckCircle2 size={16} />
        الاستشارة مكتملة — للاطلاع فقط
      </div>
    {/if}

  </div>
{/if}

<style>
  .doctor-app {
    /* ── Base palette ── */
    --paper: #f7f4ee;
    --paper-deep: #efe9dd;
    --paper-warm: #faf7f2;
    --ink: #1d2621;
    --ink-soft: #4b564f;
    --ink-muted: #7a8a82;
    --pine: #163832;
    --pine-light: #24544a;
    --pine-mist: #e4ece9;
    --pine-hover: #1c4840;
    --apricot: #e0793f;
    --apricot-deep: #c25f2b;
    --apricot-mist: #fdf0e8;
    --gold: #c9973f;
    --gold-mist: #fdf8ec;
    --line: #ddd5c4;
    --line-soft: #ede8de;
    --white: #ffffff;

    /* ── Semantic colors ── */
    --success: #3f9c6f;
    --success-mist: #e6f3ee;
    --success-deep: #2d7a54;
    --danger: #c0392b;
    --danger-mist: #fdecea;
    --danger-soft: #f87171;
    --warning: #c97e2b;
    --warning-mist: #fef3e6;
    --info: #2563eb;
    --info-mist: #e8f0fe;
    --purple: #7c3aed;
    --purple-mist: #f3e8ff;

    /* ── Gradients ── */
    --grad-pine: linear-gradient(135deg, var(--pine) 0%, var(--pine-light) 100%);
    --grad-apricot: linear-gradient(135deg, var(--apricot) 0%, var(--apricot-deep) 100%);
    --grad-progress: linear-gradient(90deg, var(--pine-light), var(--apricot));
    --grad-hero: linear-gradient(160deg, #163832 0%, #24544a 60%, #1e4a40 100%);

    /* ── Shadows ── */
    --shadow-xs: 0 1px 3px rgba(22,56,50,0.08);
    --shadow-sm: 0 4px 12px -4px rgba(22,56,50,0.14);
    --shadow-md: 0 8px 24px -8px rgba(22,56,50,0.2);
    --shadow-lg: 0 20px 48px -16px rgba(22,56,50,0.28);
    --shadow-apricot: 0 8px 20px -8px rgba(224,121,63,0.45);
    --shadow-chat: 0 0 0 1px rgba(22,56,50,0.06), 0 24px 60px -12px rgba(22,38,33,0.4);

    /* ── Consult type colors ── */
    --chat-color: var(--info);
    --chat-mist: var(--info-mist);
    --audio-color: var(--success);
    --audio-mist: var(--success-mist);
    --video-color: var(--purple);
    --video-mist: var(--purple-mist);

    /* ── Status colors ── */
    --status-waiting-color: var(--warning);
    --status-waiting-mist: var(--warning-mist);
    --status-active-color: var(--success);
    --status-active-mist: var(--success-mist);
    --status-done-color: var(--ink-muted);
    --status-done-mist: var(--paper-deep);
    --status-scheduled-color: var(--gold);
    --status-scheduled-mist: var(--gold-mist);

    --font-head: 'Markazi Text', 'IBM Plex Sans Arabic', serif;
    --font-body: 'IBM Plex Sans Arabic', 'Segoe UI', sans-serif;

    direction: rtl;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-body);
    line-height: 1.6;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .doctor-app :global(*) {
    box-sizing: border-box;
  }

  .doctor-app :global(h1),
  .doctor-app :global(h2),
  .doctor-app :global(h3) {
    font-family: var(--font-head);
    color: var(--pine);
    margin: 0;
    font-weight: 600;
  }

  .doctor-app :global(p) {
    margin: 0;
    color: var(--ink-soft);
  }

  .doctor-app :global(a) {
    color: inherit;
    text-decoration: none;
  }

  .doctor-app :global(button) {
    font-family: var(--font-body);
    cursor: pointer;
    border: none;
    background: none;
  }

  .doctor-app :global(:focus-visible) {
    outline: 2px solid var(--apricot);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .doctor-app :global(*) {
      transition: none !important;
      animation: none !important;
    }
  }

  .container {
    width: 100%;
    max-width: 940px;
    margin: 0 auto;
    padding-inline: 32px;
  }

  @media (max-width: 600px) {
    .container {
      padding-inline: 18px;
    }
  }

  /* ---------------- Buttons ---------------- */
  .primary-btn,
  .outline-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 13px 26px;
    border-radius: 999px;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  .primary-btn {
    background: var(--grad-pine);
    color: black;
    box-shadow: var(--shadow-md);
  }

  .primary-btn:hover {
    background: var(--grad-apricot);
    color: var(--white);
    transform: translateY(-2px);
    box-shadow: var(--shadow-apricot);
  }

  .primary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .outline-btn {
    background: transparent;
    color: var(--pine);
    border: 1.5px solid var(--pine);
  }

  .outline-btn:hover {
    background: var(--pine);
    color: var(--white);
  }

  /* ---------------- Header ---------------- */
  .navbar {
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgba(247, 244, 238, 0.92);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }

  .nav-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 78px;
    max-width: 940px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
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
    font-size: 1.1rem;
    line-height: 1.1;
  }

  .logo span {
    font-size: 0.75rem;
    color: var(--ink-soft);
  }

  .back-link {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .back-link:hover {
    color: var(--pine);
  }

  .back-link :global(.flip-rtl) {
    transform: scaleX(-1);
  }

  /* ---------------- Page body ---------------- */
  .page-body {
    padding: 44px 0 90px;
    display: flex;
    flex-direction: column;
    gap: 34px;
  }

  /* ---------------- Profile card ---------------- */
  .profile-card {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 24px;
    padding: 30px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    box-shadow: var(--shadow-sm);
  }

  .profile-main {
    display: flex;
    align-items: flex-start;
    gap: 20px;
  }

  .profile-avatar {
    position: relative;
    width: 76px;
    height: 76px;
    border-radius: 50%;
    background: var(--grad-pine);
    color: var(--paper);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.7rem;
    font-weight: 700;
    flex-shrink: 0;
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .profile-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .avatar-badge {
    position: absolute;
    bottom: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--white);
    border: 2px solid var(--white);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar-badge i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--line);
    display: block;
  }

  .avatar-badge.online i {
    background: var(--success);
    box-shadow: 0 0 0 2px var(--success-mist);
  }

  .profile-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile-name-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .profile-name-row h1 {
    font-size: 1.5rem;
  }

  .verified-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--pine-mist);
    color: var(--pine-light);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 11px;
    border-radius: 999px;
  }

  .profile-tagline {
    font-size: 0.95rem;
    color: var(--ink-soft);
  }

  .profile-meta {
    font-size: 0.88rem;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .profile-meta .dot {
    color: var(--line);
  }

  .profile-stats {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    margin-top: 6px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  .stat :global(svg) {
    color: var(--gold);
  }

  .stat strong {
    color: var(--ink);
    font-weight: 700;
  }

  /* ---------------- Profile fetch states ---------------- */
  .profile-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 36px 20px;
    color: var(--ink-soft);
    font-size: 0.95rem;
    text-align: center;
  }

  .profile-state-error {
    color: var(--danger-soft);
  }

  .spinner {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 3px solid var(--line);
    border-top-color: var(--pine-light);
    animation: profile-spin 0.8s linear infinite;
  }

  @keyframes profile-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .profile-retry {
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--paper);
    background: var(--grad-pine);
    border: none;
    padding: 9px 22px;
    border-radius: 999px;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .profile-retry:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  @media (max-width: 560px) {
    .profile-main {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .profile-name-row,
    .profile-meta,
    .profile-stats {
      justify-content: center;
    }
  }

  /* ---------------- Online toggle ---------------- */
  .online-toggle-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: var(--pine-mist);
    border-radius: 16px;
    padding: 16px 20px;
  }

  .online-toggle-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .online-toggle-text strong {
    font-size: 0.95rem;
    color: var(--pine);
  }

  .online-toggle-text span {
    font-size: 0.82rem;
    color: var(--ink-soft);
  }

  .online-toggle-text span.available {
    color: var(--success);
    font-weight: 600;
  }

  /* ---------------- Switch ---------------- */
  .switch {
    position: relative;
    width: 50px;
    height: 28px;
    border-radius: 999px;
    background: var(--line);
    flex-shrink: 0;
    transition: background-color 0.2s ease;
  }

  .switch.on {
    background: var(--success);
  }

  .switch-thumb {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--white);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease;
  }

  .switch.on .switch-thumb {
    transform: translateX(-22px);
  }

  .switch.small {
    width: 38px;
    height: 22px;
  }

  .switch.small .switch-thumb {
    width: 16px;
    height: 16px;
    top: 3px;
    right: 3px;
  }

  .switch.small.on .switch-thumb {
    transform: translateX(-16px);
  }

  /* ---------------- Settings heading ---------------- */
  .settings-heading {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .settings-heading h2 {
    font-size: 1.55rem;
  }

  .settings-heading p {
    font-size: 0.92rem;
  }

  /* ---------------- Panel ---------------- */
  .panel {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 22px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .panel-header-icon {
    width: 44px;
    height: 44px;
    border-radius: 13px;
    background: var(--pine-mist);
    color: var(--pine);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .panel-header h3 {
    font-size: 1.1rem;
    margin-bottom: 3px;
  }

  .panel-header p {
    font-size: 0.85rem;
  }

  /* ---------------- Pricing ---------------- */
  .price-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .price-card {
    border: 1.5px solid var(--line);
    border-radius: 16px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    transition: border-color 0.15s ease;
    min-width: 0;
    overflow: hidden;
  }

  .price-card:focus-within {
    border-color: var(--pine-light);
  }

  .price-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .price-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: var(--pine-mist);
    color: var(--pine);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .price-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ink);
    direction: ltr;
    text-align: left;
  }

  .price-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--paper-deep);
    border-radius: 12px;
    padding: 8px 14px;
  }

  .price-input-row input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    font-family: var(--font-head);
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--pine);
    text-align: right;
  }

  .price-input-row input:focus {
    outline: none;
  }

  .price-input-row .currency {
    font-size: 0.82rem;
    color: var(--ink-soft);
    font-weight: 600;
    flex-shrink: 0;
    order: 1;
  }

  @media (max-width: 720px) {
    .price-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ---------------- Rules ---------------- */
  .rules-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .field span {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
  }

  .field input,
  .field select {
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--ink);
    background: var(--paper-deep);
    border: 1.5px solid var(--line);
    border-radius: 12px;
    padding: 12px 16px;
    transition: border-color 0.15s ease;
  }

  .field input:focus,
  .field select:focus {
    border-color: var(--pine-light);
    outline: none;
  }

  @media (max-width: 560px) {
    .rules-grid {
      grid-template-columns: 1fr;
    }
  }

  .booking-types {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 18px;
    border-top: 1px dashed var(--line);
  }

  .booking-types-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
    color: var(--ink-soft);
    cursor: pointer;
  }

  .checkbox-row input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .checkbox-box {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    border: 1.5px solid var(--line);
    background: var(--white);
    color: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .checkbox-row input:checked + .checkbox-box {
    background: var(--pine);
    border-color: var(--pine);
    color: var(--paper);
  }

  /* ---------------- Page actions ---------------- */
  .page-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    position: sticky;
    bottom: 20px;
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 16px 22px;
    box-shadow: 0 20px 40px -20px rgba(29, 38, 33, 0.3);
  }

  .saved-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--success);
  }

  .page-actions-buttons {
    display: flex;
    gap: 12px;
    margin-inline-start: auto;
  }

  @media (max-width: 480px) {
    .page-actions-buttons {
      width: 100%;
    }

    .page-actions-buttons .outline-btn,
    .page-actions-buttons .primary-btn {
      flex: 1;
    }
  }

  /* ============================================================
     TODAY'S STATS
  ============================================================ */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  @media (max-width: 760px) {
    .stats-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 420px) {
    .stats-row {
      grid-template-columns: 1fr;
    }
  }

  .stat-card {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 18px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    box-shadow: var(--shadow-xs);
    transition: box-shadow 0.2s, transform 0.2s;
  }

  .stat-card:hover {
    box-shadow: var(--shadow-sm);
    transform: translateY(-2px);
  }

  .stat-card-icon {
    width: 44px;
    height: 44px;
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ── stat cards ── */
  .stat-card-icon.revenue  { background: var(--success-mist); color: var(--success-deep); }
  .stat-card-icon.waiting  { background: var(--warning-mist); color: var(--warning); }
  .stat-card-icon.completed{ background: var(--pine-mist); color: var(--pine); }
  .stat-card-icon.reviews  { background: var(--gold-mist); color: var(--gold); }

  .stat-card-label {
    display: block;
    font-size: 0.78rem;
    color: var(--ink-soft);
    margin-bottom: 3px;
  }

  .stat-card-value {
    display: block;
    font-family: var(--font-head);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--pine);
  }

  /* ============================================================
     NOTIFICATIONS
  ============================================================ */
  .notif-panel {
    gap: 0;
    padding: 0;
    overflow: visible;
  }

  .notif-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 24px 28px;
    text-align: right;
    background: none;
  }

  .notif-header:hover {
    background: var(--paper-deep);
    border-radius: 22px;
  }

  .notif-header-text {
    flex: 1;
  }

  .notif-header-text h3 {
    font-size: 1.1rem;
    margin-bottom: 3px;
  }

  .notif-header-text p {
    font-size: 0.85rem;
  }

  /* ── notification badge ── */
  .notif-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--grad-apricot);
    color: var(--white);
    font-size: 0.75rem;
    font-weight: 700;
    box-shadow: var(--shadow-xs);
  }

  .notif-chevron {
    color: var(--ink-soft);
  }

  .notif-body {
    padding: 0 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-top: 1px dashed var(--line);
  }

  .mark-read-btn {
    align-self: flex-end;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--pine-light);
    text-decoration: underline;
    padding: 4px 0;
  }

  .notif-empty {
    font-size: 0.9rem;
    color: var(--ink-soft);
    padding: 12px 0;
  }

  .notif-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .notif-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 13px;
    background: var(--paper-deep);
    transition: background-color 0.15s ease;
  }

  .notif-item.unread {
    background: var(--pine-mist);
  }

  .notif-type-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ── notification type icons ── */
  .notif-type-icon.instant   { background: var(--danger-mist);  color: var(--danger); }
  .notif-type-icon.scheduled { background: var(--pine-mist);    color: var(--pine); }
  .notif-type-icon.review    { background: var(--gold-mist);    color: var(--gold); }

  .notif-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .notif-text strong {
    font-size: 0.88rem;
    color: var(--ink);
  }

  .notif-text span {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }

  .notif-dismiss {
    color: var(--ink-soft);
    padding: 4px;
    border-radius: 8px;
    transition: background-color 0.15s ease;
  }

  .notif-dismiss:hover {
    background: var(--line);
    color: var(--ink);
  }

  /* ============================================================
     PROFILE COMPLETION
  ============================================================ */
  .completion-bar-wrap {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .completion-bar {
    flex: 1;
    height: 10px;
    border-radius: 999px;
    background: var(--paper-deep);
    overflow: hidden;
  }

  /* ── completion bar gradient ── */
  .completion-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--grad-progress);
    transition: width 0.5s ease;
  }

  .completion-pct {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--pine);
    min-width: 38px;
    text-align: left;
  }

  .completion-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--pine-light);
    text-decoration: underline;
    align-self: flex-start;
  }

  .completion-steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px dashed var(--line);
  }

  .completion-step {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.88rem;
    color: var(--ink-soft);
  }

  .completion-step.done {
    color: var(--success);
  }

  .step-icon {
    display: flex;
    flex-shrink: 0;
  }

  /* ============================================================
     PATIENTS LIST
  ============================================================ */
  .patients-panel {
    gap: 20px;
  }

  /* --- filter tabs --- */
  .patients-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--line);
  }

  .ptab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--ink-soft);
    padding: 7px 14px;
    border-radius: 999px;
    border: 1.5px solid transparent;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  }

  .ptab:hover {
    background: var(--paper-deep);
    color: var(--ink);
  }

  .ptab.active {
    background: var(--pine);
    color: var(--paper);
    border-color: var(--pine);
  }

  .ptab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: rgba(255,255,255,0.25);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .ptab:not(.active) .ptab-count {
    background: var(--paper-deep);
    color: var(--ink-soft);
  }

  /* --- patients rows --- */
  .patients-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .patient-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 18px;
    border-radius: 16px;
    border: 1.5px solid var(--line);
    background: var(--white);
    transition: border-color 0.15s, box-shadow 0.15s;
    flex-wrap: wrap;
  }

  .patient-row:hover {
    border-color: var(--pine-light);
    box-shadow: 0 4px 16px -8px rgba(22,56,50,0.15);
  }

  /* ── patient row border colors ── */
  .patient-row.status-waiting   { border-right: 4px solid var(--status-waiting-color); }
  .patient-row.status-active    { border-right: 4px solid var(--status-active-color); }
  .patient-row.status-done      { border-right: 4px solid var(--line); opacity: 0.75; }
  .patient-row.status-scheduled { border-right: 4px solid var(--status-scheduled-color); }

  .patient-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--grad-pine);
    color: var(--paper);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 700;
    flex-shrink: 0;
    box-shadow: var(--shadow-xs);
  }

  .patient-info {
    flex: 1;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .patient-name-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .patient-name-row strong {
    font-size: 0.95rem;
    color: var(--ink);
  }

  .patient-age {
    font-size: 0.78rem;
    color: var(--ink-soft);
    background: var(--paper-deep);
    padding: 2px 8px;
    border-radius: 999px;
  }

  .patient-complaint {
    font-size: 0.84rem;
    color: var(--ink-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }

  .patient-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
  }

  .consult-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
  }

  /* ── consult type badges ── */
  .consult-chat      { background: var(--chat-mist);  color: var(--chat-color); }
  .consult-audio     { background: var(--audio-mist); color: var(--audio-color); }
  .consult-video     { background: var(--video-mist); color: var(--video-color); }

  .patient-wait {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--ink-soft);
  }

  /* --- status pills --- */
  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 5px 13px;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── status pills ── */
  .status-pill-waiting   { background: var(--status-waiting-mist);   color: var(--status-waiting-color); }
  .status-pill-active    { background: var(--status-active-mist);    color: var(--status-active-color); }
  .status-pill-done      { background: var(--status-done-mist);      color: var(--status-done-color); }
  .status-pill-scheduled { background: var(--status-scheduled-mist); color: var(--status-scheduled-color); }

  /* --- patient action buttons --- */
  .patient-actions {
    flex-shrink: 0;
  }

  .chat-open-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
    background: var(--grad-apricot);
    padding: 9px 18px;
    border-radius: 999px;
    transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
    box-shadow: var(--shadow-apricot);
  }

  .chat-open-btn:hover {
    background: linear-gradient(135deg, #c25f2b 0%, #a34d22 100%);
    transform: translateY(-2px);
    box-shadow: 0 10px 24px -8px rgba(194, 95, 43, 0.55);
  }

  .chat-unread-dot {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--danger-soft);
    border: 2px solid var(--white);
  }

  .chat-view-btn {
    font-size: 0.83rem;
    font-weight: 600;
    color: var(--ink-soft);
    border: 1.5px solid var(--line);
    padding: 8px 16px;
    border-radius: 999px;
    transition: background-color 0.15s;
  }

  .chat-view-btn:hover {
    background: var(--paper-deep);
    color: var(--ink);
  }

  .patients-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 40px 0;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }

  @media (max-width: 600px) {
    .patient-row { flex-direction: column; align-items: flex-start; }
    .patient-actions { align-self: stretch; }
    .chat-open-btn, .chat-view-btn { width: 100%; justify-content: center; }
  }

  /* ============================================================
     CHAT OVERLAY
  ============================================================ */
  .chat-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(22, 38, 33, 0.5);
    backdrop-filter: blur(4px);
    z-index: 100;
    cursor: pointer;
  }

  .chat-window {
    position: fixed;
    inset-inline-end: 24px;
    bottom: 24px;
    width: min(460px, calc(100vw - 32px));
    height: min(600px, calc(100vh - 80px));
    background: var(--white);
    border-radius: 20px;
    border: 1px solid var(--line);
    box-shadow: var(--shadow-chat);
    z-index: 101;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    direction: ltr;
  }

  /* everything inside goes back to RTL */
  .chat-window > * {
    direction: rtl;
  }

  /* --- chat header --- */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: #5d544e;   /* apricot-mist */
    color: black;        /* pine */
    flex-shrink: 0;
  }

  .chat-header-avatar {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255,255,255,0.18);
    border: 1.5px solid rgba(255,255,255,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--paper);
    flex-shrink: 0;
    letter-spacing: 0.5px;
  }

  .chat-avatar-dot {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255,255,255,0.3);
    border: 2px solid var(--pine);
  }

  .chat-avatar-dot.online-dot {
    background: #4ade80;
  }

  .chat-header-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .chat-header-info strong {
    font-size: 0.93rem;
    font-weight: 700;
    color: var(--paper);
    font-family: var(--font-body);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-header-info span {
    font-size: 0.72rem;
    color: rgba(231,224,209,0.65);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .chat-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pine);                 /* was: rgba(231,224,209,0.7) */
  transition: background-color 0.15s, color 0.15s;
}

.chat-icon-btn:hover {
  background: var(--apricot-mist);    /* was: rgba(255,255,255,0.14) */
  color: var(--apricot-deep);         /* was: var(--paper) */
}

  .chat-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pine);                 /* was: rgba(231,224,209,0.7) */
  transition: background-color 0.15s, color 0.15s;
  margin-inline-start: 2px;
}

.chat-close-btn:hover {
  background: var(--apricot-mist);    /* was: rgba(255,80,60,0.25) */
  color: var(--apricot-deep);         /* was: #fca5a5 */
}

  /* --- status bar --- */
  .chat-status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--paper-deep);
    flex-shrink: 0;
  }

  .chat-wait-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.74rem;
    color: var(--ink-soft);
    margin-inline-start: auto;
  }

  /* --- messages body --- */
  .chat-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 14px 12px;
    display: flex;
    flex-direction: column;
    scroll-behavior: smooth;
    background: #eef1f0;
    /* restore RTL for message content */
    direction: rtl;
  }

  /* custom scrollbar */
  .chat-body::-webkit-scrollbar { width: 4px; }
  .chat-body::-webkit-scrollbar-track { background: transparent; }
  .chat-body::-webkit-scrollbar-thumb { background: var(--line); border-radius: 99px; }

  .chat-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--ink-soft);
    text-align: center;
    padding: 40px 20px;
  }

  .chat-empty :global(svg) { opacity: 0.35; }

  .chat-empty p {
    font-size: 0.86rem;
    line-height: 1.75;
    color: var(--ink-soft);
  }

  .chat-messages {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* each message row */
  .msg-wrap {
    display: flex;
    align-items: flex-end;
    gap: 7px;
  }

  /* patient messages — appear on the RIGHT in RTL */
  .msg-patient {
    flex-direction: row;          /* avatar → bubble, RTL renders right-to-left */
    justify-content: flex-start;  /* flex-start = visual right in RTL */
  }

  /* doctor messages — appear on the LEFT in RTL */
  .msg-doctor {
    flex-direction: row-reverse;  /* flips to left side in RTL */
    justify-content: flex-start;
  }

  .msg-avatar-sm {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #d4e8e3;
    color: var(--pine);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-bottom: 2px;
    border: 1.5px solid #b8d8d0;
  }

  /* ── doctor msg avatar ── */
  .msg-avatar-doctor {
    background: var(--grad-pine);
    color: var(--paper);
  }

  .msg-bubble {
    max-width: 75%;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .msg-bubble p {
    margin: 0;
    padding: 9px 13px;
    border-radius: 16px;
    font-size: 0.86rem;
    line-height: 1.6;
    word-break: break-word;
  }

  /* patient bubble — white card with subtle shadow */
  .msg-patient .msg-bubble p {
    background: #ffffff;
    color: var(--ink);
    border: 1px solid #d6e4e0;
    border-top-right-radius: 4px;
    box-shadow: 0 1px 4px rgba(22,56,50,0.08);
  }

  /* ── doctor bubble ── */
  .msg-doctor .msg-bubble p {
    background: #1a5c50;
    color: #e8f5f2;
    border-top-left-radius: 4px;
    box-shadow: 0 2px 6px rgba(22,56,50,0.25);
  }

  .msg-bubble time {
    font-size: 0.68rem;
    color: var(--ink-muted);
    padding-inline: 3px;
    display: block;
    opacity: 0.85;
  }

  .msg-patient .msg-bubble time { text-align: right; color: var(--ink-muted); }
  .msg-doctor  .msg-bubble time { text-align: left;  color: rgba(200,235,228,0.75); }

  /* date separator */
  .msg-date-sep {
    text-align: center;
    font-size: 0.72rem;
    color: var(--ink-soft);
    margin: 8px 0 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .msg-date-sep::before,
  .msg-date-sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  /* --- input bar --- */
  .chat-input-bar {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--line);
    background: var(--white);
    flex-shrink: 0;
    direction: rtl;
  }

  .chat-attach-btn {
    width: 36px;
    height: 36px;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-soft);
    flex-shrink: 0;
    transition: background-color 0.15s;
  }

  .chat-attach-btn:hover {
    background: var(--paper-deep);
    color: var(--pine);
  }

  .chat-textarea {
    flex: 1;
    font-family: var(--font-body);
    font-size: 0.88rem;
    color: var(--ink);
    background: var(--paper-deep);
    border: 1.5px solid var(--line);
    border-radius: 12px;
    padding: 9px 13px;
    resize: none;
    line-height: 1.5;
    max-height: 110px;
    overflow-y: auto;
    transition: border-color 0.15s, box-shadow 0.15s;
    direction: rtl;
  }

  .chat-textarea:focus {
    border-color: var(--pine-light);
    box-shadow: 0 0 0 3px rgba(36,84,74,0.12);
    background: var(--white);
    outline: none;
  }

  .chat-textarea::placeholder { color: var(--ink-soft); opacity: 0.6; }

  .chat-send-btn {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--paper-deep);
    color: var(--ink-soft);
    flex-shrink: 0;
    transition: background-color 0.2s, color 0.2s, transform 0.15s, box-shadow 0.15s;
  }

  .chat-send-btn.ready {
    background: var(--grad-pine);
    color: var(--paper);
    box-shadow: var(--shadow-md);
  }

  .chat-send-btn.ready:hover {
    background: var(--grad-apricot);
    transform: scale(1.07);
    box-shadow: var(--shadow-apricot);
  }

  .chat-send-btn:disabled { cursor: not-allowed; opacity: 0.5; }

  /* --- done bar --- */
  .chat-done-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 13px;
    border-top: 1px solid var(--line);
    background: var(--paper-deep);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink-soft);
    flex-shrink: 0;
    direction: rtl;
  }

  @media (max-width: 520px) {
    .chat-window {
      inset-inline-end: 0;
      bottom: 0;
      width: 100vw;
      height: 93svh;
      border-radius: 20px 20px 0 0;
    }
  }

  /* ============================================================
     CLINICS / HOSPITALS
  ============================================================ */

  .clinics-panel .panel-header {
    flex-wrap: wrap;
    gap: 12px;
  }

  .add-clinic-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--pine);
    background: var(--pine-mist);
    border: 1.5px solid var(--pine-light);
    padding: 8px 18px;
    border-radius: 999px;
    margin-inline-start: auto;
    transition: background-color 0.15s, color 0.15s, transform 0.15s;
    flex-shrink: 0;
  }

  .add-clinic-btn:hover {
    background: var(--pine);
    color: var(--paper);
    transform: translateY(-1px);
  }

  /* empty state */
  .clinics-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    color: var(--ink-soft);
    text-align: center;
    border: 2px dashed var(--line);
    border-radius: 18px;
  }

  .clinics-empty :global(svg) { opacity: 0.3; }

  .clinics-empty p {
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  /* list of clinic cards */
  .clinics-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* ── single clinic card ── */
  .clinic-card {
    border: 1.5px solid var(--line);
    border-radius: 18px;
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .clinic-card.expanded {
    border-color: var(--pine-light);
    box-shadow: 0 4px 20px -8px rgba(22, 56, 50, 0.15);
  }

  /* card header row */
  .clinic-card-head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    background: var(--paper-warm);
    cursor: default;
    flex-wrap: wrap;
  }

  .clinic-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--pine-mist);
    color: var(--pine);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .clinic-type-badge.hospital {
    background: var(--info-mist);
    color: var(--info);
  }

  .clinic-head-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .clinic-head-info strong {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clinic-head-info span {
    font-size: 0.78rem;
    color: var(--ink-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clinic-head-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .clinic-expand-btn {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-soft);
    transition: background-color 0.15s, color 0.15s;
  }

  .clinic-expand-btn:hover {
    background: var(--pine-mist);
    color: var(--pine);
  }

  .clinic-remove-btn {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-muted);
    transition: background-color 0.15s, color 0.15s;
  }

  .clinic-remove-btn:hover {
    background: var(--danger-mist);
    color: var(--danger);
  }

  /* expandable body */
  .clinic-body {
    padding: 20px;
    border-top: 1px dashed var(--line);
    display: flex;
    flex-direction: column;
    gap: 24px;
    background: var(--white);
  }

  /* basic info fields grid */
  .clinic-fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .clinic-field-wide {
    grid-column: span 2;
  }

  @media (max-width: 700px) {
    .clinic-fields {
      grid-template-columns: 1fr 1fr;
    }
    .clinic-field-wide {
      grid-column: span 2;
    }
  }

  @media (max-width: 480px) {
    .clinic-fields {
      grid-template-columns: 1fr;
    }
    .clinic-field-wide {
      grid-column: span 1;
    }
  }

  .clinic-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .clinic-field label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink);
  }

  .clinic-field input,
  .clinic-field select {
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--ink);
    background: var(--paper-deep);
    border: 1.5px solid var(--line);
    border-radius: 12px;
    padding: 10px 14px;
    transition: border-color 0.15s;
    width: 100%;
  }

  .clinic-field input:focus,
  .clinic-field select:focus {
    border-color: var(--pine-light);
    outline: none;
    background: var(--white);
  }

  .clinic-fee-wrap {
    display: flex;
    align-items: center;
    background: var(--paper-deep);
    border: 1.5px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .clinic-fee-wrap:focus-within {
    border-color: var(--pine-light);
    background: var(--white);
  }

  .clinic-fee-wrap input {
    flex: 1;
    border: none;
    background: none;
    font-family: var(--font-head);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--pine);
    padding: 10px 14px;
    text-align: right;
  }

  .clinic-fee-wrap input:focus { outline: none; }

  .clinic-fee-wrap span {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
    padding-inline-end: 12px;
    flex-shrink: 0;
  }

  /* clinic weekly schedule */
  .clinic-schedule {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 20px;
    border-top: 1px dashed var(--line);
  }

  .schedule-off-tag {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }

  .clinic-schedule-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--pine);
    font-family: var(--font-body);
    margin: 0;
  }

  .clinic-schedule-title :global(svg) {
    color: var(--gold);
    flex-shrink: 0;
  }

  .clinic-days-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .clinic-day-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--pine-mist);
    flex-wrap: wrap;
  }

  .clinic-day-row.is-off {
    background: var(--paper-deep);
    opacity: 0.75;
  }

  .clinic-day-label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 110px;
    padding-top: 2px;
  }

  .clinic-day-label strong {
    font-size: 0.88rem;
    color: var(--ink);
  }

  /* slots column */
  .clinic-slots {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .clinic-slot {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .clinic-slot label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }

  .clinic-slot label span {
    font-weight: 600;
    color: var(--ink);
    min-width: 18px;
  }

  .clinic-slot input[type='time'] {
    font-family: var(--font-body);
    font-size: 0.86rem;
    color: var(--ink);
    background: var(--white);
    border: 1.5px solid var(--line);
    border-radius: 10px;
    padding: 6px 10px;
    transition: border-color 0.15s;
  }

  .clinic-slot input[type='time']:focus {
    border-color: var(--pine-light);
    outline: none;
  }

  .clinic-slot small {
    color: var(--gold);
    font-weight: 600;
    font-size: 0.78rem;
    direction: ltr;
    min-width: 70px;
  }

  .slot-remove-btn {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-muted);
    flex-shrink: 0;
    transition: background-color 0.15s, color 0.15s;
  }

  .slot-remove-btn:hover {
    background: var(--danger-mist);
    color: var(--danger);
  }

  .slot-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--pine-light);
    background: none;
    border: 1.5px dashed var(--pine-light);
    padding: 5px 13px;
    border-radius: 999px;
    align-self: flex-start;
    transition: background-color 0.15s, color 0.15s;
  }

  .slot-add-btn:hover {
    background: var(--pine-mist);
    color: var(--pine);
  }

  @media (max-width: 580px) {
    .clinic-card-head { flex-wrap: wrap; }
    .clinic-day-row   { flex-direction: column; }
    .clinic-slot      { flex-direction: column; align-items: flex-start; }
  }

  /* ---- unsaved badge & row error (new) ---- */
  .clinic-unsaved-badge {
    display: inline-flex;
    align-items: center;
    font-size: .68rem;
    font-weight: 600;
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 99px;
    padding: 1px 8px;
    margin-right: 6px;
  }

  .clinic-row-error {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: .8rem;
    color: #dc2626;
    background: #fef2f2;
    border-top: 1px solid #fecaca;
    padding: 6px 16px;
  }

  .save-error-hint {
    color: #dc2626 !important;
  }
</style>