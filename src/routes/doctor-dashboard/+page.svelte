<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { tick, untrack } from 'svelte';
  import {
    Stethoscope,
    Star,
    ShieldCheck,
    CheckCircle2,
    Users,
    MessageCircle,
    Phone,
    Video,
    CalendarDays,
    Wallet,
    ArrowLeft,
    Save,
    X,
    Bell,
    BadgeCheck,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Send,
    Paperclip,
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

  // Login hands over the resolved doctor via /doctor-dashboard?id=<uuid>.
  // Without it the dashboard falls back to the first row.
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

  // The list endpoint omits profile_image, so the picture is fetched per doctor
  // from GET /doctors/:id.
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
        const img = typeof data?.doctor?.profile_image === 'string' ? data.doctor.profile_image : '';
        if (cancelled) return;

        doctors = doctors.map((d) => (d.id === id ? { ...d, profileImage: img } : d));
      } catch {
        // A missing picture is not a page-level failure.
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

  let isOnline = $state(false);
  let togglingOnline = $state(false);

  $effect(() => {
    if (doctor) isOnline = doctor.isOnline;
  });

  async function toggleOnlineStatus() {
    if (!doctor || togglingOnline) return;

    const next = !isOnline;

    // Optimistic update.
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

      isOnline = typeof data.is_online === 'boolean' ? data.is_online : next;

      doctors = doctors.map((d) => (d.id === doctor!.id ? { ...d, isOnline } : d));
    } catch {
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

  interface ApiSchedule {
    id: number;
    work_place_id: string;
    day_of_week: number; // 0=السبت … 6=الجمعة
    day_name: string;
    is_off: boolean;
    from_time?: string; // "HH:MM"
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

  type PlaceType = 'عيادة خاصة' | 'مستشفى' | 'مركز طبي' | 'مستوصف';

  interface ClinicSlot {
    id: number; // local-only counter for keying, not sent to API
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
    apiId: string; // empty for new (unsaved) rows
    localId: number;
    type: PlaceType;
    name: string;
    address: string;
    phone: string;
    consultFee: number;
    days: ClinicDay[];
    saving: boolean;
    saveError: string;
  }

  const DAY_META: { dayOfWeek: number; label: string }[] = [
    { dayOfWeek: 0, label: 'السبت' },
    { dayOfWeek: 1, label: 'الأحد' },
    { dayOfWeek: 2, label: 'الاثنين' },
    { dayOfWeek: 3, label: 'الثلاثاء' },
    { dayOfWeek: 4, label: 'الأربعاء' },
    { dayOfWeek: 5, label: 'الخميس' },
    { dayOfWeek: 6, label: 'الجمعة' }
  ];

  function blankDays(): ClinicDay[] {
    return DAY_META.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      label: d.label,
      isOff: true,
      slots: []
    }));
  }

  function schedulesToDays(schedules: ApiSchedule[]): ClinicDay[] {
    const byDay = new Map<number, ApiSchedule[]>();
    for (const s of schedules) {
      const arr = byDay.get(s.day_of_week) ?? [];
      arr.push(s);
      byDay.set(s.day_of_week, arr);
    }
    const hhmm = (t?: string) => (t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : '');

    return DAY_META.map((d) => {
      const rows = byDay.get(d.dayOfWeek) ?? [];
      const isOff = rows.length === 0 || rows.every((r) => r.is_off);
      const slots: ClinicSlot[] = isOff
        ? []
        : rows
            .filter((r) => !r.is_off && hhmm(r.from_time) && hhmm(r.to_time))
            .map((r) => ({ id: ++slotIdCounter, from: hhmm(r.from_time), to: hhmm(r.to_time) }));
      return { dayOfWeek: d.dayOfWeek, label: d.label, isOff, slots };
    });
  }

  function daysToSchedules(days: ClinicDay[]) {
    const out: { day_of_week: number; is_off: boolean; from_time?: string; to_time?: string }[] = [];
    for (const day of days) {
      if (day.isOff || day.slots.length === 0) {
        out.push({ day_of_week: day.dayOfWeek, is_off: true });
      } else {
        const validSlots = day.slots.filter((slot) => {
          if (!slot.from || !slot.to) return false;
          const pad = (t: string) => t.split(':').map((p) => p.padStart(2, '0')).join(':');
          return pad(slot.from) < pad(slot.to);
        });
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

  function toLocalType(apiType: string): PlaceType {
    const map: Record<string, PlaceType> = {
      'عيادة خاصة': 'عيادة خاصة',
      'مستشفى': 'مستشفى',
      'مركز طبي': 'مركز طبي',
      'مستوصف': 'مستوصف'
    };
    return map[apiType] ?? 'عيادة خاصة';
  }

  function toApiType(t: PlaceType): string {
    return t;
  }

  function apiToClinic(wp: ApiWorkPlace, localId: number): Clinic {
    return {
      apiId: wp.id,
      localId,
      type: toLocalType(wp.place_type),
      name: wp.name,
      address: wp.address,
      phone: wp.phone ?? '',
      consultFee: wp.exam_price ?? 0,
      days: schedulesToDays(wp.schedules ?? []),
      saving: false,
      saveError: ''
    };
  }

  let clinics = $state<Clinic[]>([]);
  let clinicsLoading = $state(false);
  let clinicsError = $state('');
  let slotIdCounter = 0;
  let localIdCounter = $state(1);

  let expandedClinicIds = $state<number[]>([]);

  // Load work places whenever the resolved doctor changes
  $effect(() => {
    const id = doctor?.id;
    if (!id) return;

    clinicsLoading = true;
    clinicsError = '';

    (async () => {
      try {
        const res = await fetch(`${WORK_PLACES_API}?doctor_id=${encodeURIComponent(id)}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data?.error ?? `فشل تحميل أماكن العمل (${res.status})`);

        const rows: ApiWorkPlace[] = Array.isArray(data?.work_places) ? data.work_places : [];
        let counter = untrack(() => localIdCounter);
        clinics = rows.map((wp) => apiToClinic(wp, counter++));
        localIdCounter = counter;

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

  function addClinic() {
    const localId = ++localIdCounter;
    clinics = [
      ...clinics,
      {
        apiId: '',
        localId,
        type: 'عيادة خاصة',
        name: '',
        address: '',
        phone: '',
        consultFee: 0,
        days: blankDays(),
        saving: false,
        saveError: ''
      }
    ];
    expandedClinicIds = [...expandedClinicIds, localId];
  }

  async function removeClinic(localId: number) {
    const clinic = clinics.find((c) => c.localId === localId);
    if (!clinic) return;

    if (!clinic.apiId) {
      clinics = clinics.filter((c) => c.localId !== localId);
      expandedClinicIds = expandedClinicIds.filter((x) => x !== localId);
      return;
    }

    clinics = clinics.map((c) => (c.localId === localId ? { ...c, saving: true, saveError: '' } : c));

    try {
      const res = await fetch(`${WORK_PLACES_API}/${clinic.apiId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `فشل الحذف (${res.status})`);

      clinics = clinics.filter((c) => c.localId !== localId);
      expandedClinicIds = expandedClinicIds.filter((x) => x !== localId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر حذف المكان';
      clinics = clinics.map((c) => (c.localId === localId ? { ...c, saving: false, saveError: msg } : c));
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
          if (nowOff) {
            return { ...d, isOff: true };
          } else {
            const restored =
              d.slots.length > 0 ? d.slots : [{ id: ++slotIdCounter, from: '09:00', to: '17:00' }];
            return { ...d, isOff: false, slots: restored };
          }
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
    if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return '';
    const period = h >= 12 ? 'م' : 'ص';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // Save a single clinic to the API (create or update) then persist its schedules
  async function saveClinic(clinic: Clinic): Promise<ClinicDay[]> {
    if (!doctor?.id) throw new Error('لم يتم تحديد الطبيب');

    const latest = clinics.find((c) => c.localId === clinic.localId) ?? clinic;

    const body = {
      doctor_id: doctor.id,
      place_type: toApiType(latest.type),
      name: latest.name.trim(),
      address: latest.address.trim(),
      phone: latest.phone.trim(),
      exam_price: latest.consultFee || null
    };

    let apiId = latest.apiId;

    if (!apiId) {
      const res = await fetch(WORK_PLACES_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `فشل الإنشاء (${res.status})`);
      apiId = (data?.work_place as ApiWorkPlace)?.id ?? '';
      if (!apiId) throw new Error('لم يُرجع السيرفر معرّف المكان');
      clinics = clinics.map((c) => (c.localId === latest.localId ? { ...c, apiId } : c));
    } else {
      const res = await fetch(`${WORK_PLACES_API}/${apiId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          place_type: body.place_type,
          name: body.name,
          address: body.address,
          phone: body.phone,
          exam_price: body.exam_price
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `فشل التحديث (${res.status})`);
    }

    const currentDays = (clinics.find((c) => c.localId === latest.localId) ?? latest).days;
    const schedPayload = { schedules: daysToSchedules(currentDays) };
    const schedRes = await fetch(`${WORK_PLACES_API}/${apiId}/schedules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(schedPayload)
    });
    const schedData = await schedRes.json();
    if (!schedRes.ok) throw new Error(schedData?.error ?? `فشل حفظ المواعيد (${schedRes.status})`);

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

  // ---------------- Chat (live from the Go API) ----------------

  const CONVERSATIONS_API = '/api/conversations';
  const PATIENTS_API = '/api/patients';
  const MAX_CHAT_IMAGE = 5 * 1024 * 1024; // same as MaxImageSize in server.go

  // The WebSocket lives at /ws/chat (outside /api) — see the Vite proxy rule.
  function chatSocketUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws/chat`;
  }

  interface ApiConversation {
    id: string;
    patient_id: number;
    doctor_id: string;
    created_at: string;
    updated_at: string;
  }

  interface ApiMessage {
    id: number;
    conversation_id: string;
    sender_type: 'patient' | 'doctor';
    sender_id: string;
    message?: string;
    image_data?: string; // data URL
    created_at: string;
  }

  interface ChatPatient {
    conversationId: string;
    patientId: number;
    name: string;
    initials: string;
    phone: string;
    updatedAt: string;
    unread: boolean;
  }

  let chatPatients = $state<ChatPatient[]>([]);
  let chatsLoading = $state(false);
  let chatsError = $state('');

  let activeChat = $state<ChatPatient | null>(null);
  let chatMessages = $state<ApiMessage[]>([]);
  let chatMessagesLoading = $state(false);
  let chatInput = $state('');
  let chatSending = $state(false);
  let chatConnected = $state(false);
  let chatErr = $state('');
  let chatBodyEl = $state<HTMLElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  let ws: WebSocket | null = null;
  const patientCache = new Map<number, { username: string; phone: string }>();
  // conversationId -> updated_at the doctor has already seen ('sync' = take next value)
  const lastSeen = new Map<string, string>();

  function initialsOf(name: string): string {
    return (
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.charAt(0))
        .join('') || '؟'
    );
  }

  function formatMsgTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' });
  }

  function formatActivity(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function getPatient(id: number) {
    const cached = patientCache.get(id);
    if (cached) return cached;
    try {
      const res = await fetch(`${PATIENTS_API}/${id}`);
      const data = await res.json();
      const info = {
        username: text(data?.patient?.username, `مريض #${id}`),
        phone: text(data?.patient?.phone, '—')
      };
      if (res.ok) patientCache.set(id, info);
      return info;
    } catch {
      return { username: `مريض #${id}`, phone: '—' };
    }
  }

  async function loadConversations(silent = false) {
    const doctorId = doctor?.id;
    if (!doctorId) return;

    if (!silent) {
      chatsLoading = true;
      chatsError = '';
    }

    try {
      const res = await fetch(`${CONVERSATIONS_API}?doctor_id=${encodeURIComponent(doctorId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(text(data?.error, `فشل تحميل المحادثات (${res.status})`));

      const rows: ApiConversation[] = Array.isArray(data?.conversations) ? data.conversations : [];

      chatPatients = await Promise.all(
        rows.map(async (c) => {
          const p = await getPatient(c.patient_id);

          const isOpen = activeChat?.conversationId === c.id;
          if (isOpen || !lastSeen.has(c.id) || lastSeen.get(c.id) === 'sync') {
            lastSeen.set(c.id, c.updated_at);
          }
          const unread = Date.parse(c.updated_at) > Date.parse(lastSeen.get(c.id)!);

          return {
            conversationId: c.id,
            patientId: c.patient_id,
            name: p.username,
            initials: initialsOf(p.username),
            phone: p.phone,
            updatedAt: c.updated_at,
            unread
          };
        })
      );
    } catch (err) {
      if (!silent) chatsError = err instanceof Error ? err.message : 'تعذّر تحميل المحادثات';
    } finally {
      if (!silent) chatsLoading = false;
    }
  }

  // Load conversations when the doctor is known, then refresh every 8s.
  $effect(() => {
    const id = doctor?.id;
    if (!id) return;

    untrack(() => loadConversations());
    const timer = setInterval(() => untrack(() => loadConversations(true)), 8000);
    return () => clearInterval(timer);
  });

  async function scrollChatToBottom() {
    await tick();
    if (chatBodyEl) chatBodyEl.scrollTop = chatBodyEl.scrollHeight;
  }

  function appendMessage(m: ApiMessage) {
    if (!activeChat || m.conversation_id !== activeChat.conversationId) return;
    if (chatMessages.some((x) => x.id === m.id)) return; // REST + WS can both deliver it
    chatMessages = [...chatMessages, m];
    scrollChatToBottom();
  }

  function closeSocket() {
    if (ws) {
      const s = ws;
      ws = null;
      s.onclose = null;
      s.close();
    }
    chatConnected = false;
  }

  function connectSocket(conversationId: string) {
    const doctorId = doctor?.id;
    if (!doctorId) return;

    const socket = new WebSocket(chatSocketUrl());
    ws = socket;

    socket.onmessage = (ev) => {
      let evt: { type: string; message?: ApiMessage; error?: string };
      try {
        evt = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (evt.type === 'connected') {
        socket.send(
          JSON.stringify({
            type: 'subscribe',
            conversation_id: conversationId,
            sender_type: 'doctor',
            sender_id: doctorId
          })
        );
      } else if (evt.type === 'subscribed') {
        chatConnected = true;
      } else if (evt.type === 'message.created' && evt.message) {
        appendMessage(evt.message);
      } else if (evt.type === 'error') {
        chatErr = evt.error ?? 'خطأ في المحادثة';
      }
    };

    socket.onclose = () => {
      if (ws === socket) {
        ws = null;
        chatConnected = false;
      }
    };
  }

  async function openChat(patient: ChatPatient) {
    closeSocket();

    activeChat = patient;
    chatMessages = [];
    chatInput = '';
    chatErr = '';
    chatMessagesLoading = true;

    lastSeen.set(patient.conversationId, patient.updatedAt);
    chatPatients = chatPatients.map((p) =>
      p.conversationId === patient.conversationId ? { ...p, unread: false } : p
    );

    try {
      const res = await fetch(`${CONVERSATIONS_API}/${patient.conversationId}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(text(data?.error, `فشل تحميل الرسائل (${res.status})`));

      if (activeChat?.conversationId !== patient.conversationId) return; // user switched chat
      chatMessages = Array.isArray(data?.messages) ? data.messages : [];
    } catch (err) {
      chatErr = err instanceof Error ? err.message : 'تعذّر تحميل الرسائل';
    } finally {
      chatMessagesLoading = false;
    }

    if (activeChat?.conversationId === patient.conversationId) {
      scrollChatToBottom();
      connectSocket(patient.conversationId);
    }
  }

  function closeChat() {
    if (activeChat) lastSeen.set(activeChat.conversationId, 'sync');
    closeSocket();
    activeChat = null;
    chatMessages = [];
    loadConversations(true);
  }

  // Close the socket when the page is destroyed.
  $effect(() => () => closeSocket());

  async function sendMessage() {
    const body = chatInput.trim();
    if (!body || !activeChat || !doctor || chatSending) return;
    chatErr = '';

    // Preferred path: WebSocket (server saves it and broadcasts message.created back).
    if (ws && chatConnected && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'message',
          conversation_id: activeChat.conversationId,
          sender_type: 'doctor',
          sender_id: doctor.id,
          message: body
        })
      );
      chatInput = '';
      return;
    }

    // Fallback: REST.
    chatSending = true;
    try {
      const res = await fetch(`${CONVERSATIONS_API}/${activeChat.conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sender_type: 'doctor', sender_id: doctor.id, message: body })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(text(data?.error, `فشل الإرسال (${res.status})`));
      chatInput = '';
      if (data?.message) appendMessage(data.message as ApiMessage);
    } catch (err) {
      chatErr = err instanceof Error ? err.message : 'تعذّر إرسال الرسالة';
    } finally {
      chatSending = false;
    }
  }

  async function handleFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !activeChat || !doctor) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      chatErr = 'مسموح فقط بصور JPG أو PNG أو WEBP';
      return;
    }
    if (file.size > MAX_CHAT_IMAGE) {
      chatErr = 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت';
      return;
    }

    chatErr = '';
    chatSending = true;
    try {
      const fd = new FormData();
      fd.append('sender_type', 'doctor');
      fd.append('sender_id', doctor.id);
      fd.append('message', chatInput.trim());
      fd.append('image', file);

      // No content-type header: the browser sets the multipart boundary.
      const res = await fetch(`${CONVERSATIONS_API}/${activeChat.conversationId}/messages/image`, {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(text(data?.error, `فشل إرسال الصورة (${res.status})`));

      chatInput = '';
      if (data?.message) appendMessage(data.message as ApiMessage);
    } catch (err) {
      chatErr = err instanceof Error ? err.message : 'تعذّر إرسال الصورة';
    } finally {
      chatSending = false;
    }
  }

  function handleChatKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ----------------------------------------------------------------
  // Save all clinics

  let saving = $state(false);
  let savedJustNow = $state(false);
  let saveError = $state('');

  async function saveSettings() {
    if (saving || !doctor?.id) return;
    saving = true;
    saveError = '';

    clinics = clinics.map((c) => ({ ...c, saveError: '' }));

    let anyFailed = false;

    for (const clinic of clinics) {
      if (!clinic.name.trim() || !clinic.address.trim()) {
        clinics = clinics.map((c) =>
          c.localId === clinic.localId ? { ...c, saveError: 'اسم المكان والعنوان مطلوبان' } : c
        );
        anyFailed = true;
        continue;
      }

      const invalidDays = clinic.days.filter((d) => {
        if (d.isOff) return false;
        const pad = (t: string) => t.split(':').map((p) => p.padStart(2, '0')).join(':');
        return d.slots.some((s) => !s.from || !s.to || pad(s.from) >= pad(s.to));
      });
      if (invalidDays.length > 0) {
        const names = invalidDays.map((d) => d.label).join('، ');
        clinics = clinics.map((c) =>
          c.localId === clinic.localId ? { ...c, saveError: `يرجى تصحيح أوقات الكشف في: ${names}` } : c
        );
        anyFailed = true;
        continue;
      }

      clinics = clinics.map((c) => (c.localId === clinic.localId ? { ...c, saving: true } : c));

      try {
        const updatedDays = await saveClinic(clinic);
        clinics = clinics.map((c) =>
          c.localId === clinic.localId ? { ...c, saving: false, saveError: '', days: updatedDays } : c
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'تعذّر الحفظ';
        clinics = clinics.map((c) => (c.localId === clinic.localId ? { ...c, saving: false, saveError: msg } : c));
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
    clinicsError = '';
    try {
      const res = await fetch(`${WORK_PLACES_API}?doctor_id=${encodeURIComponent(doctor.id)}`);
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


    <!-- ===== PATIENTS / CONVERSATIONS ===== -->
    <section class="panel patients-panel">

      <div class="panel-header">
        <div class="panel-header-icon">
          <Inbox size={20} />
        </div>
        <div>
          <h3>قائمة المرضى</h3>
          <p>المحادثات الحقيقية مع المرضى — افتح الشات للرد</p>
        </div>
      </div>

      {#if chatsLoading}
        <div class="clinics-empty">
          <div class="spinner" aria-hidden="true"></div>
          <p>جارٍ تحميل المحادثات…</p>
        </div>
      {:else if chatsError}
        <div class="clinics-empty">
          <AlertCircle size={28} />
          <p>{chatsError}</p>
          <button class="add-clinic-btn" onclick={() => loadConversations()}>إعادة المحاولة</button>
        </div>
      {:else if chatPatients.length === 0}
        <div class="patients-empty">
          <UserRound size={32} />
          <span>لا توجد محادثات مع مرضى بعد</span>
        </div>
      {:else}
        <ul class="patients-list">
          {#each chatPatients as patient (patient.conversationId)}
            <li class="patient-row" class:status-waiting={patient.unread}>

              <div class="patient-avatar" aria-hidden="true">{patient.initials}</div>

              <div class="patient-info">
                <div class="patient-name-row">
                  <strong>{patient.name}</strong>
                </div>
                <div class="patient-meta">
                  <span class="patient-wait">
                    <Phone size={12} />
                    {patient.phone}
                  </span>
                  <span class="patient-wait">
                    <ClockIcon size={12} />
                    آخر نشاط: {formatActivity(patient.updatedAt)}
                  </span>
                </div>
              </div>

              <div class="patient-actions">
                <button
                  class="chat-open-btn"
                  onclick={() => openChat(patient)}
                  aria-label="فتح محادثة مع {patient.name}"
                >
                  <MessageCircle size={16} />
                  فتح الشات
                  {#if patient.unread}
                    <span class="chat-unread-dot"></span>
                  {/if}
                </button>
              </div>

            </li>
          {/each}
        </ul>
      {/if}

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

                          {#if day.isOff}
                            <span class="schedule-off-tag">يوم عطلة / غير متاح</span>
                          {:else}
                            <div class="clinic-slots">
                              {#each day.slots as slot (slot.id)}
                                {@const slotInvalid = !!slot.from && !!slot.to && slot.from >= slot.to}
                                <div class="clinic-slot" class:invalid={slotInvalid}>
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
                                  {#if slotInvalid}
                                    <span class="slot-error-msg">وقت البداية يجب أن يكون قبل وقت النهاية</span>
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
{#if activeChat}
  <div
    class="chat-backdrop"
    role="button"
    tabindex="-1"
    aria-label="إغلاق المحادثة"
    onclick={closeChat}
    onkeydown={(e) => e.key === 'Escape' && closeChat()}
  ></div>

  <div class="chat-window" role="dialog" aria-modal="true" aria-label="محادثة مع {activeChat.name}">

    <div class="chat-header">
      <div class="chat-header-avatar" aria-hidden="true">
        {activeChat.initials}
        <span class="chat-avatar-dot" class:online-dot={chatConnected}></span>
      </div>

      <div class="chat-header-info">
        <strong>{activeChat.name}</strong>
        <span>{activeChat.phone}</span>
      </div>

      <div class="chat-header-actions">
        <button class="chat-close-btn" onclick={closeChat} aria-label="إغلاق">
          <X size={19} />
        </button>
      </div>
    </div>

    <div class="chat-status-bar">
      <span class="status-pill" class:status-pill-active={chatConnected} class:status-pill-waiting={!chatConnected}>
        {chatConnected ? 'متصل مباشر' : 'جارٍ الاتصال…'}
      </span>
    </div>

    <div class="chat-body" bind:this={chatBodyEl}>
      {#if chatMessagesLoading}
        <div class="chat-empty">
          <div class="spinner" aria-hidden="true"></div>
          <p>جارٍ تحميل الرسائل…</p>
        </div>
      {:else if chatMessages.length === 0}
        <div class="chat-empty">
          <MessageCircle size={36} />
          <p>لا توجد رسائل بعد.<br />ابدأ المحادثة مع المريض.</p>
        </div>
      {:else}
        <div class="chat-messages">
          {#each chatMessages as msg (msg.id)}
            <div
              class="msg-wrap"
              class:msg-doctor={msg.sender_type === 'doctor'}
              class:msg-patient={msg.sender_type === 'patient'}
            >
              {#if msg.sender_type === 'patient'}
                <div class="msg-avatar-sm" aria-hidden="true">{activeChat.initials}</div>
              {:else}
                <div class="msg-avatar-sm msg-avatar-doctor" aria-hidden="true">د</div>
              {/if}
              <div class="msg-bubble">
                {#if msg.image_data}
                  <img class="msg-img" src={msg.image_data} alt="صورة مرفقة" />
                {/if}
                {#if msg.message}
                  <p>{msg.message}</p>
                {/if}
                <time>{formatMsgTime(msg.created_at)}</time>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if chatErr}
      <div class="chat-err">
        <AlertCircle size={14} />
        {chatErr}
      </div>
    {/if}

    <div class="chat-input-bar">
      <input
        bind:this={fileInputEl}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="chat-file-input"
        onchange={handleFilePicked}
      />
      <button
        class="chat-attach-btn"
        aria-label="إرفاق صورة"
        disabled={chatSending}
        onclick={() => fileInputEl?.click()}
      >
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
        disabled={chatInput.trim().length === 0 || chatSending}
      >
        <Send size={18} />
      </button>
    </div>

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

  .stat-card-icon.revenue   { background: var(--success-mist); color: var(--success-deep); }
  .stat-card-icon.waiting   { background: var(--warning-mist); color: var(--warning); }
  .stat-card-icon.completed { background: var(--pine-mist); color: var(--pine); }
  .stat-card-icon.reviews   { background: var(--gold-mist); color: var(--gold); }

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

  .notif-type-icon.instant   { background: var(--danger-mist); color: var(--danger); }
  .notif-type-icon.scheduled { background: var(--pine-mist);   color: var(--pine); }
  .notif-type-icon.review    { background: var(--gold-mist);   color: var(--gold); }

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
     PATIENTS LIST
  ============================================================ */
  .patients-panel {
    gap: 20px;
  }

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

  .patient-row.status-waiting { border-right: 4px solid var(--status-waiting-color); }

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

  .patient-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
    flex-wrap: wrap;
  }

  .patient-wait {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--ink-soft);
  }

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

  .status-pill-waiting   { background: var(--status-waiting-mist);   color: var(--status-waiting-color); }
  .status-pill-active    { background: var(--status-active-mist);    color: var(--status-active-color); }
  .status-pill-done      { background: var(--status-done-mist);      color: var(--status-done-color); }
  .status-pill-scheduled { background: var(--status-scheduled-mist); color: var(--status-scheduled-color); }

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
    .chat-open-btn { width: 100%; justify-content: center; }
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
    font-family: var(--font-body);
  }

  .chat-window > * {
    direction: rtl;
  }

  .chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: #5d544e;
    color: black;
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

  .chat-close-btn {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--paper);
    transition: background-color 0.15s, color 0.15s;
    margin-inline-start: 2px;
  }

  .chat-close-btn:hover {
    background: var(--apricot-mist);
    color: var(--apricot-deep);
  }

  .chat-status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--paper-deep);
    flex-shrink: 0;
  }

  .chat-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 14px 12px;
    display: flex;
    flex-direction: column;
    scroll-behavior: smooth;
    background: #eef1f0;
    direction: rtl;
  }

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

  .msg-wrap {
    display: flex;
    align-items: flex-end;
    gap: 7px;
  }

  .msg-patient {
    flex-direction: row;
    justify-content: flex-start;
  }

  .msg-doctor {
    flex-direction: row-reverse;
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

  .msg-patient .msg-bubble p {
    background: #ffffff;
    color: var(--ink);
    border: 1px solid #d6e4e0;
    border-top-right-radius: 4px;
    box-shadow: 0 1px 4px rgba(22,56,50,0.08);
  }

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
  .msg-doctor  .msg-bubble time { text-align: left;  color: var(--ink-muted); }

  .msg-img {
    max-width: 100%;
    max-height: 240px;
    border-radius: 12px;
    object-fit: cover;
    display: block;
    border: 1px solid var(--line);
  }

  .chat-err {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: #dc2626;
    background: #fef2f2;
    border-top: 1px solid #fecaca;
    padding: 6px 14px;
    flex-shrink: 0;
  }

  .chat-file-input { display: none; }

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

  .chat-attach-btn:disabled { cursor: not-allowed; opacity: 0.5; }

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

  .clinics-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

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

  .clinic-body {
    padding: 20px;
    border-top: 1px dashed var(--line);
    display: flex;
    flex-direction: column;
    gap: 24px;
    background: var(--white);
  }

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

  .slot-error-msg {
    font-size: 0.75rem;
    color: var(--danger);
  }

  @media (max-width: 580px) {
    .clinic-card-head { flex-wrap: wrap; }
    .clinic-day-row   { flex-direction: column; }
    .clinic-slot      { flex-direction: column; align-items: flex-start; }
  }

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