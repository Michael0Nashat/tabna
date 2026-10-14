<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    LogOut,
    MessageCircle,
    Send,
    UserRound,
    Stethoscope,
    Clock,
    AlertCircle,
  } from 'lucide-svelte';
  import { page } from '$app/state';
  import { openChatSocket, loadMessages as fetchConversationMessages } from '$lib/chat.js';

  /**
   * A conversation row returned by GET /api/conversations.
   * @typedef {object} Conversation
   * @property {string|number} [id]
   * @property {string|number} [doctor_id]
   * @property {string|number} [patient_id]
   * @property {string} [updated_at]
   */

  const PATIENTS_API = '/api/patients';
  const CONVERSATIONS_API = '/api/conversations';
  const DOCTORS_API = '/api/doctors';

  const patientId = $derived(
    (() => {
      const raw = page.url.searchParams.get('id');
      if (!raw) return '';
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : '';
    })()
  );

  /** @type {{ id?: number, username?: string, phone?: string, created_at?: string } | null} */
  let patient = $state(null);
  /** @type {Conversation[]} */
  let conversations = $state([]);
  /** @type {import('$lib/ws-chat-client').ChatMessagePayload[]} */
  let messages = $state([]);
  let newMessage = $state('');
  let loading = $state(true);
  let error = $state('');
  /** @type {string | number} */
  let selectedConversationId = $state('');
  let sending = $state(false);
  let loadMsgError = $state('');
  /** @type {Map<string|number, string>} */
  let doctorMap = new Map();

  // Live socket for the open conversation. The Go backend pushes
  // `message.created` events through /ws/chat, so the doctor's reply shows
  // up without reloading. REST remains the fallback (see $lib/chat.js).
  /** @type {{ client: import('$lib/ws-chat-client').WSClient, send: (text: string) => void, dispose: () => void } | null} */
  let chatSession = $state(null);

  /** @param {import('$lib/ws-chat-client').ChatMessagePayload} msg */
  function appendMessage(msg) {
    // Ignore echoes of our own sends: both our socket and the REST fallback
    // surface the row we just created; the peer's side does not.
    if (msg?.sender_type === 'patient' && msg?.sender_id === String(patientId)) return;
    messages = [...messages, msg];
  }

  /** @param {string|number} conversationId */
  function openChat(conversationId) {
    closeChat();
    if (!conversationId || !patientId) return;
    chatSession = openChatSocket({
      conversationId: String(conversationId),
      senderType: 'patient',
      senderId: String(patientId),
      onIncoming: appendMessage,
      onError: (err) => {
        // Non-fatal: the REST fallback in $lib/chat.js still delivers sends.
        loadMsgError = `متصل جزئيًا: ${err}`;
      }
    });
  }

  function closeChat() {
    if (chatSession) {
      chatSession.dispose();
      chatSession = null;
    }
  }

  /** @param {string|number} conversationId */
  function loadConversationMessages(conversationId) {
    selectedConversationId = conversationId;
    loadMsgError = '';
    messages = [];
    if (!conversationId) return;
    fetchConversationMessages(String(conversationId))
      .then((rows) => {
        // Only keep the rows that belong to the conversation still on screen;
        // the user may have switched away while the fetch was in flight.
        if (selectedConversationId === conversationId) messages = rows;
      })
      .catch((err) => {
        if (selectedConversationId === conversationId) {
          loadMsgError = err instanceof Error ? err.message : 'تعذّر تحميل الرسائل';
        }
      });
    openChat(conversationId);
  }

  onDestroy(() => closeChat());

  async function loadPatient() {
    if (!patientId) { error = 'لم يتم تحديد حساب المريض.'; loading = false; return; }
    loading = true; error = '';
    try {
      const res = await fetch(`${PATIENTS_API}/${patientId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      patient = data?.patient ?? null;
      if (!patient) throw new Error('لم يتم العثور على بيانات المريض.');
    } catch (err) {
      error = err instanceof Error ? err.message : 'تعذّر تحميل بيانات المريض';
    } finally { loading = false; }
  }

  async function loadDoctors() {
    try {
      const res = await fetch(DOCTORS_API);
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data?.doctors) ? data.doctors : [];
      doctorMap.clear();
      for (const d of rows) { if (d?.id) doctorMap.set(d.id, d.full_name || d.name || 'طبيب'); }
    } catch { /* non-fatal */ }
  }

  async function loadConversations() {
    if (!patientId) return;
    try {
      const res = await fetch(`${CONVERSATIONS_API}?patient_id=${patientId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      conversations = Array.isArray(data?.conversations) ? data.conversations : [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'تعذّر تحميل المحادثات';
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConversationId || sending || !chatSession) return;
    sending = true;
    const body = newMessage.trim();
    newMessage = '';
    try {
      // chatSession.send() pushes over the live socket; when the socket is
      // down it transparently falls back to the REST proxy so the message is
      // always stored. The peer's side receives it via `message.created`.
      chatSession.send(body);
    } catch (err) {
      loadMsgError = err instanceof Error ? err.message : 'تعذّر إرسال الرسالة';
      newMessage = body;
    } finally { sending = false; }
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  /** @param {string|number|undefined} doctorId */
  function getDoctorName(doctorId) {
    if (doctorId == null) return 'طبيب';
    return doctorMap.get(doctorId) || 'طبيب';
  }

  /** @param {string|undefined} isoString */
  function formatTime(isoString) {
    if (!isoString) return '';
    try { return new Date(isoString).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  /** @param {Conversation} conv */
  function getLastMessage(conv) {
    if (!conv?.id) return '';
    const last = messages.find(m => m.conversation_id === conv.id);
    return last?.message ?? '';
  }

  onMount(() => { loadPatient(); loadDoctors(); loadConversations(); });
</script>

<svelte:head>
  <title>لوحة تحكم المريض — Medical Care</title>
  <meta name="description" content="لوحة تحكم المريض للاستشارات الطبية" />
</svelte:head>

<div class="patient-dashboard">
  <header class="pd-header">
    <div class="pd-header-inner">
      <div class="pd-logo"><Stethoscope size={22} /><span>Medical Care</span></div>
      <div class="pd-user">
        {#if patient}
          <div class="pd-avatar"><UserRound size={18} /><span>{patient.username?.charAt(0)?.toUpperCase() ?? 'م'}</span></div>
          <span class="pd-username">{patient.username}</span>
        {/if}
      </div>
      <button class="pd-logout" onclick={() => goto('/')}><LogOut size={16} />تسجيل خروج</button>
    </div>
  </header>
  <main class="pd-main">
    {#if loading}
      <div class="pd-loading"><div class="pd-spinner"></div><p>جارٍ تحميل بياناتك...</p></div>
    {:else if error && !patient}
      <div class="pd-error"><AlertCircle size={32} /><p>{error}</p><button class="pd-retry-btn" onclick={() => goto('/')}>العودة للرئيسية</button></div>
    {:else if !selectedConversationId}
      <section class="pd-conversations">
        <h2>محادثاتك</h2>
        {#if conversations.length === 0}
          <div class="pd-empty"><MessageCircle size={40} /><p>ليس لديك أي محادثات بعد</p><small>تواصل مع طبيبك من خلال لوحة تحكم الطبيب لبدء محادثة جديدة</small></div>
        {:else}
          <ul class="pd-conv-list">
            {#each conversations as conv (conv.id)}
              <li class="pd-conv-item">
                <button type="button" class="pd-conv-item-button" class:active={selectedConversationId === conv.id} disabled={conv.id == null} onclick={() => conv.id != null && loadConversationMessages(conv.id)}>
                  <div class="pd-conv-avatar"><Stethoscope size={18} /></div>
                  <div class="pd-conv-info">
                    <strong>{getDoctorName(conv.doctor_id)}</strong>
                    <p class="pd-conv-last">{messages.length > 0 ? (getLastMessage(conv) || 'ابدأ المحادثة...') : 'ابدأ المحادثة...'}</p>
                  </div>
                  <div class="pd-conv-meta">{#if conv.updated_at}<span class="pd-conv-time"><Clock size={12} />{formatTime(conv.updated_at)}</span>{/if}</div>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
      <section class="pd-chat">
        <div class="pd-chat-header">
          <button class="pd-back-btn" onclick={() => { closeChat(); selectedConversationId = ''; messages = []; }}><span class="flip-rtl">&#8592;</span> رجوع</button>
          {#if selectedConversationId}
            <div class="pd-chat-doctor">
              <div class="pd-chat-doctor-avatar"><Stethoscope size={16} /></div>
              <div><strong>{getDoctorName(conversations.find(c => c.id === selectedConversationId)?.doctor_id)}</strong><span class="pd-chat-status">متصل</span></div>
            </div>
          {/if}
        </div>
        <div class="pd-messages" class:has-error={loadMsgError}>
          {#if loadMsgError}
            <div class="pd-msg-error"><AlertCircle size={18} /><span>{loadMsgError}</span><button onclick={() => loadConversationMessages(selectedConversationId)}>إعادة المحاولة</button></div>
          {:else if messages.length === 0}
            <div class="pd-msg-empty"><MessageCircle size={36} /><p>ابدأ المحادثة مع الطبيب</p></div>
          {:else}
            {#each messages as msg (msg.id)}
              <div class="pd-msg-row" class:mine={msg.sender_type === 'patient'}>
                <div class="pd-msg-bubble">
                  {#if msg.sender_type === 'patient'}
                    <span class="pd-msg-sender">{patient?.username || 'أنا'}</span>
                  {/if}
                  <p class="pd-msg-text">{msg.message}</p>
                  <span class="pd-msg-time">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            {/each}
          {/if}
        </div>
        <div class="pd-input-area">
          <textarea class="pd-textarea" bind:value={newMessage} onkeydown={handleKeydown} placeholder="اكتب رسالتك هنا..." rows="1"></textarea>
          <button class="pd-send-btn" class:disabled={sending || !newMessage.trim()} onclick={sendMessage} disabled={sending || !newMessage.trim()} aria-label="إرسال">{#if sending}<div class="pd-send-spinner"></div>{:else}<Send size={18} />{/if}</button>
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  :global(.flip-rtl) { transform: scaleX(-1); }
  .patient-dashboard { min-height: 100vh; background: #f7f4ee; font-family: 'IBM Plex Sans Arabic', sans-serif; direction: rtl; }
  .pd-header { background: #163832; padding: 0 24px; position: sticky; top: 0; z-index: 100; }
  .pd-header-inner { max-width: 900px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; height: 60px; }
  .pd-logo { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 700; font-size: 1.1rem; }
  .pd-user { display: flex; align-items: center; gap: 10px; }
  .pd-avatar { width: 34px; height: 34px; border-radius: 50%; background: #24544a; color: #e4ece9; display: flex; align-items: center; justify-content: center; }
  .pd-avatar span { font-size: 0.85rem; font-weight: 700; }
  .pd-username { color: #e4ece9; font-size: 0.9rem; font-weight: 500; }
  .pd-logout { background: transparent; border: 1px solid #24544a; color: #e4ece9; padding: 6px 14px; border-radius: 8px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: inherit; transition: background 0.2s; }
  .pd-logout:hover { background: #24544a; }
  .pd-main { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
  .pd-conversations h2 { font-size: 1.3rem; color: #1d2621; margin-bottom: 16px; font-family: 'Markazi Text', serif; }
  .pd-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 80px 0; color: #4b564f; }
  .pd-spinner { width: 36px; height: 36px; border: 3px solid #ddd5c4; border-top-color: #163832; border-radius: 50%; animation: pd-spin 0.8s linear infinite; }
  @keyframes pd-spin { to { transform: rotate(360deg); } }
  .pd-error { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: #c25f2b; text-align: center; }
  .pd-error p { font-size: 1rem; }
  .pd-retry-btn { background: #163832; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 0.95rem; cursor: pointer; font-family: inherit; }
  .pd-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: #4b564f; text-align: center; }
  .pd-empty p { font-size: 1.1rem; color: #1d2621; }
  .pd-conv-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .pd-conv-item { padding: 0; border: none; background: transparent; list-style: none; }
  .pd-conv-item-button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; background: #fff; border-radius: 12px; cursor: pointer; transition: box-shadow 0.2s, transform 0.15s; border: 1px solid #ddd5c4; font-family: inherit; text-align: inherit; }
  .pd-conv-item-button:hover { box-shadow: 0 2px 12px rgba(22,56,50,0.08); transform: translateY(-1px); }
  .pd-conv-item-button.active { border-color: #163832; background: #e4ece9; }
  .pd-conv-avatar { width: 42px; height: 42px; border-radius: 50%; background: #163832; color: #e4ece9; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .pd-conv-info { flex: 1; min-width: 0; }
  .pd-conv-info strong { display: block; font-size: 0.95rem; color: #1d2621; }
  .pd-conv-last { font-size: 0.82rem; color: #4b564f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 2px 0 0; }
  .pd-conv-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
  .pd-conv-time { display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #4b564f; }
  .pd-chat { display: flex; flex-direction: column; height: calc(100vh - 110px); max-height: 700px; background: #fff; border-radius: 16px; border: 1px solid #ddd5c4; overflow: hidden; }
  .pd-chat-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #163832; color: #fff; }
  .pd-back-btn { background: transparent; border: none; color: #e4ece9; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 4px; font-family: inherit; padding: 4px 8px; border-radius: 6px; }
  .pd-back-btn:hover { background: rgba(255,255,255,0.1); }
  .pd-chat-doctor { display: flex; align-items: center; gap: 10px; flex: 1; }
  .pd-chat-doctor-avatar { width: 34px; height: 34px; border-radius: 50%; background: #24544a; display: flex; align-items: center; justify-content: center; }
  .pd-chat-doctor strong { display: block; font-size: 0.95rem; }
  .pd-chat-status { font-size: 0.78rem; color: #8fbf9a; }
  .pd-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .pd-msg-error { display: flex; align-items: center; gap: 8px; padding: 12px; background: #fef3e8; border-radius: 8px; color: #c25f2b; font-size: 0.9rem; }
  .pd-msg-error button { margin-right: auto; background: #c25f2b; color: #fff; border: none; padding: 4px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-family: inherit; }
  .pd-msg-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #4b564f; }
  .pd-msg-empty p { font-size: 0.95rem; }
  .pd-msg-row { display: flex; justify-content: flex-start; direction: rtl; }
  .pd-msg-row.mine { justify-content: flex-end; }
  .pd-msg-bubble { max-width: 78%; padding: 10px 14px; border-radius: 12px; background: #dfe9e5; color: #1d2621; font-size: 0.92rem; line-height: 1.5; border: 1px solid #cdd9d3; }
  .pd-msg-row.mine .pd-msg-bubble { background: #163832; color: #e4ece9; border-color: #163832; }
  .pd-msg-sender { display: block; font-size: 0.72rem; font-weight: 700; color: #4b564f; margin-bottom: 4px; }
  .pd-msg-row.mine .pd-msg-sender { color: #9fd0b8; }
  .pd-msg-text { margin: 0; word-break: break-word; }
  .pd-msg-time { display: block; font-size: 0.7rem; opacity: 0.6; margin-top: 4px; text-align: start; }
  .pd-input-area { display: flex; align-items: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid #ddd5c4; background: #faf8f4; }
  .pd-textarea { flex: 1; resize: none; border: 1px solid #ddd5c4; border-radius: 10px; padding: 10px 14px; font-size: 0.92rem; font-family: inherit; direction: rtl; background: #fff; color: #1d2621; outline: none; min-height: 44px; max-height: 120px; }
  .pd-textarea:focus { border-color: #163832; }
  .pd-send-btn { width: 44px; height: 44px; border-radius: 10px; background: #163832; color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s; }
  .pd-send-btn:hover:not(:disabled) { background: #24544a; }
  .pd-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .pd-send-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: pd-spin 0.7s linear infinite; }

  @media (max-width: 600px) {
    .pd-main { padding: 16px 12px; }
    .pd-chat { height: calc(100vh - 90px); border-radius: 12px; }
    .pd-conv-item-button { padding: 12px; }
  }
</style>
