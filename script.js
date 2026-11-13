/* =====================================
   卓の手帳 Ver.0.7：動作を担当するJavaScript
   ===================================== */

// HTMLのidを使って画面の部品を探すための短縮関数
const el = id => document.getElementById(id);

/* 1. ブラウザ内へのデータ保存
   localStorage は同じブラウザ内だけの簡易保存。
   友達との共有や端末間の同期は、将来データベースを追加して実装する。 */
function readData(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error('保存データの読み込みに失敗:', error);
    return [];
  }
}
function writeData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('保存できませんでした:', error);
    alert('保存できませんでした。画像のサイズやブラウザの保存容量を確認してください。');
    return false;
  }
}
let sessions = readData('trpgSessions'); // 前回の予定データをそのまま使う
let characters = readData('trpgCharactersV02');
let personalSchedules = readData('trpgPersonalSchedulesV15');
let scenarios = readData('trpgScenarioLibraryV15');
let currentCharacterId = null;

/* 2. 旧データとの互換性：以前の date / time を dates 配列に変換する。
   保存キー trpgSessions は変えないので、以前の卓もそのまま表示できる。 */
function getDates(session) {
  if (Array.isArray(session.dates)) return session.dates;
  return session.date ? [{date:session.date,time:session.time || ''}] : [];
}
function getStatus(session) {
  return ['未定','未確定'].includes(session.status) ? '調整中' : session.status;
}
function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function getNextSession() {
  const now = new Date();
  return sessions.flatMap(s => getStatus(s) === '通過済み' ? [] :
    getDates(s).filter(d => d.date && new Date(`${d.date}T${d.time || '23:59'}`) >= now)
      .map(d => ({...s,date:d.date,time:d.time})))
    .sort((a,b) => new Date(`${a.date}T${a.time || '23:59'}`) -
                   new Date(`${b.date}T${b.time || '23:59'}`))[0] || null;
}
function updateCharacterGuide() {
  const character = characters.find(c => c.id === currentCharacterId);
  if (!character) {
    el('characterName').textContent = '案内役を登録しよう';
    el('characterMessage').textContent = '探索者管理からお気に入り探索者を登録してね。';
    el('characterImage').textContent = '♡';
    document.documentElement.style.setProperty('--main-color','#a38acb');
    return;
  }
  el('characterName').textContent = character.name;
  document.documentElement.style.setProperty('--main-color',character.color);
  const next = getNextSession();
  const schedule = next ? `${Number(next.date.slice(5,7))}月${Number(next.date.slice(8,10))}日 ${next.time || '時間未定'}` : 'まだ決まっていない';
  el('characterMessage').textContent = (character.speech || '次の卓は{schedule}だよ！')
    .replaceAll('{schedule}',schedule);
  // textContentで既存の表示を消してから安全に画像を追加する
  const imageBox = el('characterImage');
  imageBox.textContent = '';
  if (character.image) {
    const image = document.createElement('img');
    image.src = character.image;
    image.alt = `${character.name}の立ち絵`;
    imageBox.appendChild(image);
  } else {
    imageBox.textContent = '♡';
  }
}
function chooseCharacter() {
  const favorites = characters.filter(c => c.favorite);
  if (!favorites.length) {
    currentCharacterId = null;
    updateCharacterGuide();
    return;
  }
  // 複数人いれば、直前と違う探索者からランダムに選ぶ
  const others = favorites.filter(c => c.id !== currentCharacterId);
  const pool = others.length ? others : favorites;
  currentCharacterId = pool[Math.floor(Math.random() * pool.length)].id;
  updateCharacterGuide();
}
el('changeCharacter').addEventListener('click',chooseCharacter);

/* 3. カレンダーと卓一覧で、それぞれ独立した絞り込みを使う。
   以前の「未確定」「未定」は getStatus() で「調整中」として扱う。 */
let calendarStatus = 'すべて';
let listStatus = 'すべて';
function calendarSessions() {
  return sessions.filter(session => {
    const passed = getStatus(session) === '通過済み';
    if (calendarStatus === '通過予定') return !passed;
    if (calendarStatus === '通過後') return passed;
    return true;
  });
}
function listSessions() {
  return sessions.filter(session => listStatus === 'すべて' || getStatus(session) === listStatus);
}
// 画面ごとにフィルター状態を保持する。タブを切り替えても選択が残る。
function setupStatusFilters(containerId, onSelect) {
  const container = el(containerId);
  container.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      container.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
      onSelect(button.dataset.status);
    });
  });
}
setupStatusFilters('calendarFilters', status => { calendarStatus = status; renderCalendar(); });
setupStatusFilters('listFilters', status => { listStatus = status; renderSessionList(); });

/* 4. カレンダー：同じ卓でも複数の日付に表示する */
// アプリを開くたびに「今日が属する月」を初期表示する。
// 年月ジャンプ欄は renderCalendar() で自動入力するため、毎回の入力は不要。
function getCurrentMonth() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}
let displayedDate = getCurrentMonth();
let selectedCalendarDate = null;
function renderCalendar() {
  const calendar = el('calendar');
  calendar.replaceChildren();
  const today = new Date(); // 今日の枠を強調するため現在の日付を取得
  const year = displayedDate.getFullYear();
  const month = displayedDate.getMonth();
  // 年月見出しも更新。見出しがない旧HTMLでも描画を止めない。
  const monthTitle = el('monthTitle');
  if (monthTitle) monthTitle.textContent = `${year}年 ${month+1}月`;
  // カレンダーを動かしたら年月入力欄も同期する
  el('jumpYear').value = year;
  el('jumpMonth').value = String(month + 1);
  ['日','月','火','水','木','金','土'].forEach(day => {
    const cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = day;
    calendar.appendChild(cell);
  });
  const firstDay = new Date(year,month,1).getDay();
  const lastDay = new Date(year,month+1,0).getDate();
  for(let i=0;i<firstDay;i++) calendar.appendChild(document.createElement('div'));
  for(let day=1;day<=lastDay;day++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
      cell.classList.add('is-today');
      cell.setAttribute('aria-current', 'date');
    }
    const label = document.createElement('div');
    label.textContent = day;
    cell.appendChild(label);
    const date = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    cell.dataset.date = date;
    cell.setAttribute('role','button');
    cell.setAttribute('tabindex','0');
    cell.setAttribute('aria-label',`${month+1}月${day}日の予定を表示`);
    cell.addEventListener('click',event => {
      if (event.target.closest('.calendar-event')) return;
      selectedCalendarDate = date;
      updateMobileDayAgenda();
    });
    cell.addEventListener('keydown',event => {
      if (event.target === cell && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectedCalendarDate = date; updateMobileDayAgenda(); }
    });
    // 個人予定も同じ日付マスに表示（卓の色と区別する）
    personalSchedules.filter(p=>p.date===date).forEach(p=>{
      const b=document.createElement('button'); b.type='button';b.className='calendar-event event-type-personal';
      b.textContent=`${p.time ? p.time+' ' : ''}${p.title}`;b.title='個人予定を編集';
      b.addEventListener('click',()=>openPersonalSchedule(p));cell.appendChild(b);
    });
    calendarSessions().forEach(session => {
      // 予定の種類ごとにカレンダー表示用のデータを作る。
      // 将来「HO配布日」などを追加するときも、ここに種類を増やせる。
      const calendarEvents = [];
      if (session.sheetDeadline === date) {
        calendarEvents.push({
          type: 'sheet-deadline',
          label: `📋 CS提出期限：${session.name}`,
          passed: false
        });
      }
      getDates(session).filter(d => d.date === date).forEach(d => {
        calendarEvents.push({
          type: 'session',
          label: `${d.time ? d.time + ' ' : ''}${session.name}`,
          passed: getStatus(session) === '通過済み'
        });
      });
      calendarEvents.forEach(item => {
        const eventButton = document.createElement('button');
        eventButton.type = 'button';
        eventButton.className = `calendar-event event-type-${item.type}` + (item.passed ? ' is-passed' : '');
        eventButton.textContent = item.label;
        eventButton.title = 'クリックして卓を編集';
        eventButton.addEventListener('click', () => openSessionForm(session));
        cell.appendChild(eventButton);
      });
    });
    calendar.appendChild(cell);
  }
  // 月移動時は今日（今月の場合）か1日を自動選択
  if (!selectedCalendarDate || !selectedCalendarDate.startsWith(`${year}-${String(month+1).padStart(2,'0')}-`)) {
    const chosenDay = year===today.getFullYear() && month===today.getMonth() ? today.getDate() : 1;
    selectedCalendarDate = `${year}-${String(month+1).padStart(2,'0')}-${String(chosenDay).padStart(2,'0')}`;
  }
  updateMobileDayAgenda();
}

/* スマホ向け：小さな日付マスを押すと、その日の卓と提出期限を大きく表示 */
function updateMobileDayAgenda() {
  const target = el('mobileDayEvents');
  if (!target) return;
  target.replaceChildren();
  document.querySelectorAll('.calendar-day').forEach(cell => {
    const chosen = cell.dataset.date === selectedCalendarDate;
    cell.classList.toggle('is-selected',chosen);
    cell.setAttribute('aria-pressed',String(chosen));
  });
  const [y,m,d] = selectedCalendarDate.split('-');
  el('mobileDayTitle').textContent = `${Number(m)}月${Number(d)}日の予定`;
  let count = 0;
  calendarSessions().forEach(session => {
    const items = [];
    if (session.sheetDeadline === selectedCalendarDate) items.push({type:'sheet-deadline',label:`📋 CS提出期限：${session.name}`});
    getDates(session).filter(entry => entry.date === selectedCalendarDate).forEach(entry => items.push({type:'session',label:`${entry.time ? entry.time+' ' : ''}${session.name}`}));
    items.forEach(item => {
      count++;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mobile-agenda-event event-type-${item.type}`;
      if (getStatus(session)==='通過済み' && item.type==='session') button.classList.add('is-passed');
      button.textContent = item.label;
      button.addEventListener('click',()=>openSessionPreview(session));
      target.appendChild(button);
    });
  });
  personalSchedules.filter(p=>p.date===selectedCalendarDate).sort((a,b)=>(a.time||'').localeCompare(b.time||'')).forEach(p=>{
    count++;
    const row=document.createElement('div');row.className='personal-agenda-row';
    const info=document.createElement('div');info.className='personal-agenda-text';
    const title=document.createElement('strong');title.textContent=`${p.time ? p.time+' ' : ''}${p.title}`;info.appendChild(title);
    if(p.memo){const memo=document.createElement('p');memo.textContent=p.memo;info.appendChild(memo);}
    const preview=document.createElement('button');preview.type='button';preview.className='secondary-button';preview.textContent='プレビュー';preview.addEventListener('click',()=>openScenarioPreview(item));
    const edit=document.createElement('button');edit.type='button';edit.className='secondary-button';edit.textContent='編集';edit.addEventListener('click',()=>openPersonalSchedule(p));
    const del=document.createElement('button');del.type='button';del.className='delete-button';del.textContent='削除';del.addEventListener('click',()=>{
      if(!confirm('この個人予定を削除しますか？'))return;
      const updated=personalSchedules.filter(x=>x.id!==p.id);
      if(writeData('trpgPersonalSchedulesV15',updated)){personalSchedules=updated;renderCalendar();}
    });
    row.append(info,edit,del);target.appendChild(row);
  });
  if (!count) { const empty=document.createElement('p'); empty.className='help-text'; empty.textContent='この日の予定はありません。'; target.appendChild(empty); }
}
el('prevMonth').addEventListener('click',() => {
  displayedDate.setMonth(displayedDate.getMonth()-1);
  renderCalendar();
});
el('nextMonth').addEventListener('click',() => {
  displayedDate.setMonth(displayedDate.getMonth()+1);
  renderCalendar();
});

/* 年月ジャンプ：指定した年月を表示する（1日固定で月末のずれを防ぐ） */
function jumpCalendarToSelectedMonth() {
  const year = Number(el('jumpYear').value);
  const month = Number(el('jumpMonth').value);
  if (!Number.isInteger(year) || year < 1900 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    alert('年は1900～2100の範囲で入力してください。');
    return;
  }
  displayedDate = new Date(year, month - 1, 1);
  renderCalendar();
}
el('jumpToMonth').addEventListener('click', jumpCalendarToSelectedMonth);
el('jumpMonth').addEventListener('change', jumpCalendarToSelectedMonth);
el('jumpYear').addEventListener('keydown', event => {
  if (event.key === 'Enter') jumpCalendarToSelectedMonth();
});
el('backToToday').addEventListener('click', () => {
  displayedDate = getCurrentMonth();
  renderCalendar();
});

/* 5. 卓一覧：タイトルだけを基本表示し、▼で日時を展開する。 */
function renderSessionList() {
  const list = el('sessionList'); list.replaceChildren();
  const filtered = listSessions();
  el('listResultCount').textContent = `${filtered.length}件`;
  if (!filtered.length) { list.textContent = 'この条件に当てはまる卓はありません。'; return; }
  const firstDate = s => getDates(s).map(d => d.date).filter(Boolean).sort()[0] || '9999';
  [...filtered].sort((a,b) => firstDate(a).localeCompare(firstDate(b))).forEach(s => {
    const card = document.createElement('article');
    card.className = 'session-card' + (getStatus(s) === '通過済み' ? ' is-passed' : '');
    const details = document.createElement('details'); details.className = 'session-collapse';
    const summary = document.createElement('summary'); summary.textContent = s.name;
    const dates = document.createElement('ul'); dates.className = 'session-date-list';
    const entries = getDates(s).filter(d => d.date || d.time);
    if (!entries.length) { const li=document.createElement('li');li.textContent='日程未定';dates.appendChild(li); }
    else entries.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')).forEach(d=>{
      const li=document.createElement('li');li.textContent=`${d.date||'日程未定'} ${d.time||'時間未定'}`;dates.appendChild(li);
    });
    details.append(summary,dates);
    const actions=document.createElement('div'); actions.className='session-actions';
    const buttons=[
      ['プレビュー',()=>openSessionPreview(s)],
      ['スケジュール情報',()=>openSessionForm(s)],
      ['セッション情報',()=>openSessionInfo(s)]
    ];
    buttons.forEach(([label,action])=>{
      const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=label;button.addEventListener('click',action);actions.appendChild(button);
    });
    const remove=document.createElement('button');remove.className='delete-button';remove.textContent='削除';
    remove.addEventListener('click',()=>{
      if(!confirm(`「${s.name}」を削除しますか？（画像も削除します）`))return;
      const updated=sessions.filter(item=>item.id!==s.id);
      if(!writeData('trpgSessions',updated))return;
      sessions=updated;deleteSessionImages(s.id).catch(console.error);refreshApp();
    });
    actions.appendChild(remove);card.append(details,actions);list.appendChild(card);
  });
}

/* 5-2. プレビュー：保存や編集をせず登録内容を確認する。 */
let selectedSessionId = null;
function findSelectedSession(){return sessions.find(s=>s.id===selectedSessionId);}
function previewLine(parent,label,value){
  const row=document.createElement('div');row.className='preview-row';
  const strong=document.createElement('strong');strong.textContent=label;
  const text=document.createElement('span');text.textContent=value||'未登録';
  row.append(strong,text);parent.appendChild(row);
}
function openSessionPreview(session){
  selectedSessionId=session.id;
  const area=el('sessionPreviewContent');area.replaceChildren();
  const title=document.createElement('h4');title.textContent=session.name;area.appendChild(title);
  const dateText=getDates(session).map(d=>`${d.date||'日程未定'} ${d.time||'時間未定'}`).join(' / ');
  previewLine(area,'開催日時',dateText);previewLine(area,'ステータス',getStatus(session));
  previewLine(area,'キャラクターシート提出期限',session.sheetDeadline);
  previewLine(area,'KP',session.kp);previewLine(area,'SKP',(session.skps||[]).join('、'));
  previewLine(area,'PL ／ PC',getPLPCPairs(session).map(p=>`${p.pl||'未登録'} ／ ${p.pc||'未登録'}`).join('、'));
  previewLine(area,'エンド名',session.sessionInfo?.ending);
  previewLine(area,'感想',session.sessionInfo?.impression);
  const videos=session.sessionInfo?.videos||[];
  const videoTitle=document.createElement('h4');videoTitle.textContent='動画URL';area.appendChild(videoTitle);
  if(!videos.length)previewLine(area,'','未登録');
  videos.forEach(url=>{
    const link=document.createElement('a');link.textContent=url;link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.className='preview-link';area.appendChild(link);
  });
  const imageTitle=document.createElement('h4');imageTitle.textContent='画像';area.appendChild(imageTitle);
  const gallery=document.createElement('div');gallery.className='session-image-gallery';area.appendChild(gallery);
  showScheduleView('preview');renderSessionImages(session.id,gallery,false);
}
el('closeSessionPreview').addEventListener('click',()=>showScheduleView('list'));
el('previewScheduleEdit').addEventListener('click',()=>{const s=findSelectedSession();if(s)openSessionForm(s);});
el('previewSessionInfoEdit').addEventListener('click',()=>{const s=findSelectedSession();if(s)openSessionInfo(s);});

/* 5-3. 画像は localStorage の容量を圧迫しないよう IndexedDB に分離する。 */
const IMAGE_DB_NAME='trpgSessionImagesV13';
function openImageDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('このブラウザでは画像保存を利用できません'));return;}
    const req=indexedDB.open(IMAGE_DB_NAME,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('images')){
      const store=db.createObjectStore('images',{keyPath:'id'});store.createIndex('sessionId','sessionId');
    }};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function listSessionImages(sessionId){
  const db=await openImageDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readonly');
    const req=tx.objectStore('images').index('sessionId').getAll(sessionId);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>db.close();
  });
}
async function addSessionImages(sessionId,files){
  const db=await openImageDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');const store=tx.objectStore('images');
    files.forEach(file=>store.put({id:makeId(),sessionId,name:file.name,blob:file}));
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
async function removeSessionImage(id){
  const db=await openImageDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');tx.objectStore('images').delete(id);
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
async function deleteSessionImages(sessionId){
  const records=await listSessionImages(sessionId);
  await Promise.all(records.map(record=>removeSessionImage(record.id)));
}
async function renderSessionImages(sessionId,gallery,editable){
  gallery.replaceChildren();
  try{
    const records=await listSessionImages(sessionId);
    if(selectedSessionId!==sessionId)return;
    if(!records.length){gallery.textContent='画像はまだ登録されていません。';return;}
    records.forEach(record=>{
      const figure=document.createElement('figure');figure.className='session-image-item';
      const image=document.createElement('img');const url=URL.createObjectURL(record.blob);
      image.src=url;image.alt=record.name;image.onload=()=>URL.revokeObjectURL(url);
      const caption=document.createElement('figcaption');caption.textContent=record.name;
      figure.append(image,caption);
      if(editable){const button=document.createElement('button');button.type='button';button.className='delete-button';button.textContent='画像を削除';
        button.addEventListener('click',async()=>{if(!confirm('この画像を削除しますか？'))return;
          try{await removeSessionImage(record.id);await renderSessionImages(sessionId,gallery,true);}catch(error){alert('画像を削除できませんでした。');console.error(error);}
        });figure.appendChild(button);}
      gallery.appendChild(figure);
    });
  }catch(error){console.error(error);gallery.textContent='画像の読み込みに失敗しました。';}
}
function addVideoRow(value=''){
  const row=document.createElement('div');row.className='participant-row';
  const input=document.createElement('input');input.type='url';input.placeholder='https://...';input.value=value;input.setAttribute('aria-label','動画URL');
  const remove=document.createElement('button');remove.type='button';remove.className='secondary-button';remove.textContent='×';remove.addEventListener('click',()=>row.remove());
  row.append(input,remove);el('sessionVideoRows').appendChild(row);
}
el('addSessionVideo').addEventListener('click',()=>addVideoRow());
function openSessionInfo(session){
  selectedSessionId=session.id;el('sessionInfoScenario').textContent=`シナリオ：${session.name}`;
  el('sessionEnding').value=session.sessionInfo?.ending||'';
  el('sessionImpression').value=session.sessionInfo?.impression||'';
  el('sessionVideoRows').replaceChildren();
  (session.sessionInfo?.videos?.length?session.sessionInfo.videos:['']).forEach(addVideoRow);
  el('sessionImageInput').value='';
  showScheduleView('info');renderSessionImages(session.id,el('sessionImageGallery'),true);
}
function closeSessionInfo(){const s=findSelectedSession();if(s)openSessionPreview(s);else showScheduleView('list');}
el('cancelSessionInfo').addEventListener('click',closeSessionInfo);
el('cancelSessionInfoTop').addEventListener('click',closeSessionInfo);
el('saveSessionInfo').addEventListener('click',async()=>{
  const s=findSelectedSession();if(!s)return;
  const videos=[...el('sessionVideoRows').querySelectorAll('input')].map(i=>i.value.trim()).filter(Boolean);
  if(videos.some(url=>{try{return !['http:','https:'].includes(new URL(url).protocol);}catch{return true;}}))return alert('動画URLは https:// または http:// から入力してください。');
  const files=[...el('sessionImageInput').files];
  if(files.some(f=>!['image/png','image/jpeg','image/webp','image/gif'].includes(f.type)))return alert('対応していない画像形式があります。');
  const button=el('saveSessionInfo');button.disabled=true;
  try{
    if(files.length)await addSessionImages(s.id,files);
    const updated=sessions.map(item=>item.id===s.id?{...item,sessionInfo:{ending:el('sessionEnding').value.trim(),impression:el('sessionImpression').value.trim(),videos}}:item);
    if(!writeData('trpgSessions',updated))return;
    sessions=updated;refreshApp();openSessionPreview(sessions.find(item=>item.id===s.id));
  }catch(error){console.error(error);alert('画像の保存に失敗しました。ブラウザの保存容量を確認してください。');}
  finally{button.disabled=false;}
});

/* 6. 卓登録フォーム：開催日時の行を自由に増減できる */
// 参加者の入力欄を追加。入力欄の増減は既存の卓データに影響しない。
function addParticipantRow(containerId, value = '') {
  const row = document.createElement('div');
  row.className = 'participant-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 100;
  input.placeholder = '名前を入力';
  input.value = value;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'secondary-button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', 'この名前を削除');
  remove.addEventListener('click', () => row.remove());
  row.append(input, remove);
  el(containerId).appendChild(row);
}
function getParticipantNames(containerId) {
  return [...el(containerId).querySelectorAll('input')]
    .map(input => input.value.trim()).filter(Boolean);
}
function fillParticipantRows(containerId, values) {
  el(containerId).replaceChildren();
  (values?.length ? values : ['']).forEach(name => addParticipantRow(containerId, name));
}
el('addSKP').addEventListener('click', () => addParticipantRow('sessionSKPs'));
// PLとPCは同じ行で登録し、対応関係を維持する。
function getPLPCPairs(session) {
  if (Array.isArray(session?.plpcs)) return session.plpcs;
  // Ver.0.5までの別々の配列を、同じ順番同士で組み合わせる。
  const pls = Array.isArray(session?.pls) ? session.pls : [];
  const pcs = Array.isArray(session?.pcs) ? session.pcs : [];
  return Array.from({length:Math.max(pls.length, pcs.length)}, (_,i) => ({pl:pls[i] || '',pc:pcs[i] || ''}));
}
function addPLPCRow(pl='', pc='') {
  const row = document.createElement('div');
  row.className = 'plpc-row';
  const plInput = document.createElement('input');
  plInput.type = 'text'; plInput.maxLength = 100;
  plInput.placeholder = 'PL名'; plInput.value = pl;
  plInput.setAttribute('aria-label','参加PL名');
  const pcInput = document.createElement('input');
  pcInput.type = 'text'; pcInput.maxLength = 100;
  pcInput.placeholder = 'PC名'; pcInput.value = pc;
  pcInput.setAttribute('aria-label','PC名');
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'secondary-button';
  remove.textContent = '×'; remove.setAttribute('aria-label','このPL・PCを削除');
  remove.addEventListener('click', () => row.remove());
  row.append(plInput, pcInput, remove);
  el('sessionPLPCs').appendChild(row);
}
function getPLPCFormPairs() {
  return [...el('sessionPLPCs').querySelectorAll('.plpc-row')]
    .map(row => ({pl:row.children[0].value.trim(),pc:row.children[1].value.trim()}))
    .filter(pair => pair.pl || pair.pc);
}
el('addPL').addEventListener('click', () => addPLPCRow());

let editingSessionId = null;
// 開催日選択用のミニカレンダー。選択した日付は下に曜日と時間を表示する。
let miniDisplayedDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const WEEKDAYS = ['日','月','火','水','木','金','土'];
function localDateString(year,month,day) {
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function dateWithWeekday(date) {
  const [y,m,d] = date.split('-').map(Number);
  return `${m}月${d}日（${WEEKDAYS[new Date(y,m-1,d).getDay()]}）`;
}
function renderMiniCalendar() {
  const calendar=el('miniCalendar');
  calendar.replaceChildren();
  const year=miniDisplayedDate.getFullYear(), month=miniDisplayedDate.getMonth();
  el('miniCalendarTitle').textContent=`${year}年${month+1}月`;
  WEEKDAYS.forEach((day,i)=>{
    const label=document.createElement('span');label.className='mini-weekday';
    label.textContent=day; if(i===0)label.classList.add('sunday');
    if(i===6)label.classList.add('saturday');calendar.appendChild(label);
  });
  const offset=new Date(year,month,1).getDay();
  for(let i=0;i<offset;i++)calendar.appendChild(document.createElement('span'));
  const selected=new Set([...el('sessionDates').querySelectorAll('.session-date-row')].map(r=>r.querySelector('input[type="date"]').value));
  const today=new Date();
  for(let day=1;day<=new Date(year,month+1,0).getDate();day++) {
    const date=localDateString(year,month,day);
    const button=document.createElement('button');button.type='button';button.className='mini-day';
    button.textContent=String(day);button.setAttribute('aria-label',`${month+1}月${day}日`);
    button.setAttribute('aria-pressed',selected.has(date)?'true':'false');
    if(selected.has(date))button.classList.add('selected');
    if(today.getFullYear()===year&&today.getMonth()===month&&today.getDate()===day)button.classList.add('today');
    button.addEventListener('click',()=>{
      const existing=[...el('sessionDates').querySelectorAll('.session-date-row')].find(r=>r.querySelector('input[type="date"]').value===date);
      if(existing)existing.remove();else addDateRow(date,'21:00',false);
      sortSessionDateRows();renderMiniCalendar();
    });calendar.appendChild(button);
  }
}
function sortSessionDateRows() {
  const container=el('sessionDates');
  [...container.children].sort((a,b)=>a.querySelector('input[type="date"]').value.localeCompare(b.querySelector('input[type="date"]').value)).forEach(row=>container.appendChild(row));
}
function addDateRow(date='',time='21:00',rerender=true) {
  if(!date)return;
  const row=document.createElement('div');row.className='session-date-row';
  const dateInput=document.createElement('input');dateInput.type='date';dateInput.value=date;
  dateInput.hidden=true;dateInput.setAttribute('aria-label','開催日');
  const dateLabel=document.createElement('span');dateLabel.className='session-date-label';dateLabel.textContent=dateWithWeekday(date);
  const timeInput=document.createElement('input');timeInput.type='time';timeInput.value=time||'21:00';
  timeInput.setAttribute('aria-label',`${dateWithWeekday(date)}の開始時間`);
  const remove=document.createElement('button');remove.type='button';remove.className='secondary-button remove-session-date';
  remove.textContent='×';remove.title='この開催日を削除';
  remove.addEventListener('click',()=>{row.remove();renderMiniCalendar();});
  row.append(dateInput,dateLabel,timeInput,remove);
  el('sessionDates').appendChild(row);
  if(rerender){sortSessionDateRows();renderMiniCalendar();}
}
el('miniPrevMonth').addEventListener('click',()=>{miniDisplayedDate=new Date(miniDisplayedDate.getFullYear(),miniDisplayedDate.getMonth()-1,1);renderMiniCalendar();});
el('miniNextMonth').addEventListener('click',()=>{miniDisplayedDate=new Date(miniDisplayedDate.getFullYear(),miniDisplayedDate.getMonth()+1,1);renderMiniCalendar();});
function openSessionForm(session=null) {
  editingSessionId = session?.id || null;
  el('sessionFormTitle').textContent = session ? 'スケジュール情報を編集' : '新しい卓のスケジュール情報を登録';
  el('sessionName').value = session?.name || '';
  el('sessionStatus').value = session ? getStatus(session) : '確定';
  el('sessionKP').value = session?.kp || '';
  el('sessionSheetDeadline').value = session?.sheetDeadline || '';
  fillParticipantRows('sessionSKPs', session?.skps);
  el('sessionPLPCs').replaceChildren();
  const pairs = getPLPCPairs(session);
  (pairs.length ? pairs : [{pl:'',pc:''}]).forEach(pair => addPLPCRow(pair.pl, pair.pc));

  el('sessionDates').replaceChildren();
  const dates = session ? getDates(session) : [];
  if (dates.length) dates.filter(d=>d.date).forEach(d => addDateRow(d.date,d.time||'21:00',false));
  sortSessionDateRows();
  const firstDate=dates.find(d=>d.date)?.date;
  if(firstDate){const [y,m]=firstDate.split('-').map(Number);miniDisplayedDate=new Date(y,m-1,1);}
  else {const now=new Date();miniDisplayedDate=new Date(now.getFullYear(),now.getMonth(),1);}
  renderMiniCalendar();
  showScheduleView('form');
  el('sessionForm').scrollIntoView({behavior:'smooth',block:'start'});
}

function showScheduleView(view) {
  ['calendarView','listView','sessionForm','sessionPreview','sessionInfoForm','personalScheduleForm'].forEach(id => el(id).classList.add('hidden'));
  // 表示中の画面に合った絞り込みボタンだけを表示する
  el('calendarFilters').classList.toggle('hidden', view !== 'calendar');
  el('listFilters').classList.toggle('hidden', view !== 'list');
  ['calendarTab','listTab'].forEach(id => el(id).classList.remove('active'));
  if (view === 'calendar') {
    el('calendarView').classList.remove('hidden');
    el('calendarTab').classList.add('active');
  } else if (view === 'list') {
    el('listView').classList.remove('hidden');
    el('listTab').classList.add('active');
  } else if (view === 'preview') {
    el('sessionPreview').classList.remove('hidden');
  } else if (view === 'personal') {
    el('personalScheduleForm').classList.remove('hidden');
  } else if (view === 'info') {
    el('sessionInfoForm').classList.remove('hidden');
  } else {
    el('sessionForm').classList.remove('hidden');
  }
}
el('calendarTab').addEventListener('click',() => showScheduleView('calendar'));
el('listTab').addEventListener('click',() => showScheduleView('list'));
el('newSessionButton').addEventListener('click',() => openSessionForm());
el('cancelSession').addEventListener('click',() => {
  editingSessionId = null;
  showScheduleView('list');
});
el('saveSession').addEventListener('click',() => {
  const name = el('sessionName').value.trim();
  if (!name) return alert('シナリオ名を入力してください。');
  const dates = [...el('sessionDates').querySelectorAll('.session-date-row')].map(row => ({
    date:row.querySelector('input[type="date"]').value,
    time:row.querySelector('input[type="time"]').value
  })).filter(d => d.date || d.time);
  if (dates.some(d => !d.date && d.time))
    return alert('開始時間を指定した日程には、開催日も入力してください。');
  const plpcs = getPLPCFormPairs();
  const session = {
    id:editingSessionId || makeId(),
    name,
    dates,
    status:el('sessionStatus').value,
    sheetDeadline:el('sessionSheetDeadline').value,
    kp:el('sessionKP').value.trim(),
    skps:getParticipantNames('sessionSKPs'),
    plpcs,
    // 古いバージョンとの互換性用。対応関係はplpcsを優先する。
    pls:plpcs.map(p => p.pl),
    pcs:plpcs.map(p => p.pc)
  };
  const updated = editingSessionId
    ? sessions.map(s => s.id === editingSessionId ? {...s,...session} : s)
    : [...sessions,session];
  if (!writeData('trpgSessions',updated)) return;
  sessions = updated;
  editingSessionId = null;
  refreshApp();
  showScheduleView('list');
});

/* 5. 探索者一覧：画像・名前・お気に入り状態をカードに表示 */
function renderCharacters() {
  const list = el('characterList');
  list.replaceChildren();
  if (!characters.length) {
    const message = document.createElement('p');
    message.textContent = 'まだ探索者がいません。「＋ 探索者を登録」から追加しよう！';
    list.appendChild(message);
    return;
  }
  characters.forEach(c => {
    const card = document.createElement('article');
    card.className = 'character-card';
    const portrait = document.createElement('div');
    portrait.className = 'portrait-preview';
    if (c.image) {
      const img = document.createElement('img');
      img.src = c.image;
      img.alt = `${c.name}の立ち絵`;
      portrait.appendChild(img);
    } else portrait.textContent = '画像なし';
    const name = document.createElement('h3');
    name.textContent = c.name;
    name.style.borderLeft = `4px solid ${c.color}`;
    name.style.paddingLeft = '8px';
    const profile = document.createElement('p');
    profile.textContent = c.profile || 'プロフィール未設定';
    const actions = document.createElement('div');
    actions.className = 'character-actions';
    const favorite = document.createElement('button');
    favorite.className = `favorite-button ${c.favorite ? 'on' : ''}`;
    favorite.textContent = c.favorite ? '★ お気に入り' : '☆ お気に入り';
    favorite.addEventListener('click',() => {
      const updated = characters.map(item => item.id === c.id ? {...item,favorite:!item.favorite} : item);
      if (!writeData('trpgCharactersV02',updated)) return;
      characters = updated;
      if (!characters.some(item => item.id === currentCharacterId && item.favorite)) chooseCharacter();
      renderCharacters();
    });
    const edit = document.createElement('button');
    edit.className = 'secondary-button';
    edit.textContent = '編集';
    edit.addEventListener('click',() => openCharacterForm(c));
    const remove = document.createElement('button');
    remove.className = 'delete-button';
    remove.textContent = '削除';
    remove.addEventListener('click',() => {
      if (!confirm(`「${c.name}」を削除しますか？`)) return;
      const updated = characters.filter(item => item.id !== c.id);
      if (!writeData('trpgCharactersV02',updated)) return;
      characters = updated;
      if (currentCharacterId === c.id) chooseCharacter();
      renderCharacters();
    });
    actions.append(favorite,edit,remove);
    card.append(portrait,name,profile,actions);
    if (c.sheet && /^https?:\/\//i.test(c.sheet)) {
      const link = document.createElement('a');
      link.href = c.sheet;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'キャラクターシートを開く';
      card.appendChild(link);
    }
    list.appendChild(card);
  });
}

/* 6. 探索者登録・編集フォーム */
function openCharacterForm(character=null) {
  el('characterEditor').reset();
  el('characterId').value = character?.id || '';
  el('characterInputName').value = character?.name || '';
  el('characterProfile').value = character?.profile || '';
  el('characterColor').value = character?.color || '#a38acb';
  el('characterSpeech').value = character?.speech || '次の卓は{schedule}だよ！';
  el('characterSheet').value = character?.sheet || '';
  el('characterFavorite').checked = character?.favorite ?? true;
  el('characterFormTitle').textContent = character ? '探索者を編集' : '探索者を登録';
  el('characterForm').classList.remove('hidden');
  el('characterForm').scrollIntoView({behavior:'smooth',block:'start'});
}
el('newCharacterButton').addEventListener('click',() => openCharacterForm());
el('cancelCharacter').addEventListener('click',() => el('characterForm').classList.add('hidden'));

// 画像を小さめに縮めて保存容量を節約する（PNGの透明部分も保持）
function prepareImage(file) {
  return new Promise((resolve,reject) => {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type))
      return reject(new Error('PNG・JPEG・WebP画像を選んでください。'));
    if (file.size > 2*1024*1024)
      return reject(new Error('画像は2MB以下にしてください。'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('画像を表示できませんでした。'));
      image.onload = () => {
        const scale = Math.min(1,700/Math.max(image.width,image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1,Math.round(image.width*scale));
        canvas.height = Math.max(1,Math.round(image.height*scale));
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        // PNGなら透過を保てる。JPEGでもPNGとして保存する。
        resolve(canvas.toDataURL('image/png'));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
el('characterEditor').addEventListener('submit',async event => {
  event.preventDefault();
  const name = el('characterInputName').value.trim();
  if (!name) return alert('探索者の名前を入力してください。');
  const id = el('characterId').value || crypto.randomUUID();
  const previous = characters.find(c => c.id === id);
  const file = el('characterPortrait').files[0];
  let image = previous?.image || '';
  if (file) {
    try { image = await prepareImage(file); }
    catch (error) { return alert(error.message); }
  }
  const character = {
    id, name, image,
    profile:el('characterProfile').value.trim(),
    color:el('characterColor').value,
    speech:el('characterSpeech').value.trim(),
    sheet:el('characterSheet').value.trim(),
    favorite:el('characterFavorite').checked
  };
  const updated = previous ? characters.map(c => c.id === id ? character : c) : [...characters,character];
  if (!writeData('trpgCharactersV02',updated)) return;
  characters = updated;
  el('characterForm').classList.add('hidden');
  renderCharacters();
  // 初回登録、または表示中の探索者が外れた場合は選び直す
  if (!currentCharacterId || !characters.some(c => c.id === currentCharacterId && c.favorite)) chooseCharacter();
  else updateCharacterGuide();
});

/* 7. 左メニューの画面切り替え */
function showPage(page) {
  el('schedulePage').classList.toggle('hidden',page !== 'schedule');
  el('charactersPage').classList.toggle('hidden',page !== 'characters');
  el('scenariosPage').classList.toggle('hidden',page !== 'scenarios');
  el('scheduleNav').classList.toggle('active',page === 'schedule');
  el('charactersNav').classList.toggle('active',page === 'characters');
  el('scenariosNav').classList.toggle('active',page === 'scenarios');
}
el('scheduleNav').addEventListener('click',() => showPage('schedule'));
el('charactersNav').addEventListener('click',() => showPage('characters'));
el('scenariosNav').addEventListener('click',() => showPage('scenarios'));

/* 8. アプリを開いたときに最初に実行する */
function refreshApp() {
  renderCalendar();
  renderSessionList();
  updateCharacterGuide();
}
chooseCharacter();
renderCharacters();
refreshApp();


/* Ver.0.14：スマホ下部ナビ。既存の画面切替処理を再利用する */
function updateMobileNavigation(section) {
  ['Calendar','List','Characters','Scenarios'].forEach(name => {
    const button = el('mobile'+name+'Nav');
    const active = name.toLowerCase() === section;
    button.classList.toggle('active',active);
    button.setAttribute('aria-current',active ? 'page' : 'false');
  });
}
el('mobileCalendarNav').addEventListener('click',()=>{
  showPage('schedule'); showScheduleView('calendar'); updateMobileNavigation('calendar');
  window.scrollTo({top:0,behavior:'smooth'});
});
el('mobileListNav').addEventListener('click',()=>{
  showPage('schedule'); showScheduleView('list'); updateMobileNavigation('list');
  window.scrollTo({top:0,behavior:'smooth'});
});
el('mobileScenariosNav').addEventListener('click',()=>{
  showPage('scenarios'); updateMobileNavigation('scenarios');
  window.scrollTo({top:0,behavior:'smooth'});
});
el('mobileCharactersNav').addEventListener('click',()=>{
  showPage('characters'); updateMobileNavigation('characters');
  window.scrollTo({top:0,behavior:'smooth'});
});
// PC用のボタンを使ったときも下部ナビの選択状態を揃える
el('calendarTab').addEventListener('click',()=>updateMobileNavigation('calendar'));
el('listTab').addEventListener('click',()=>updateMobileNavigation('list'));
el('scheduleNav').addEventListener('click',()=>updateMobileNavigation(el('listTab').classList.contains('active')?'list':'calendar'));
el('charactersNav').addEventListener('click',()=>updateMobileNavigation('characters'));


/* ==========================================
   Ver.0.15：個人予定とシナリオ保存フォルダ
   既存の卓データとは別キーで保存し、後の同期移行に備える。
   ========================================== */
let editingPersonalId=null;
function openPersonalSchedule(item=null){
  editingPersonalId=item?.id||null;
  el('personalScheduleFormTitle').textContent=item?'個人予定を編集':'個人予定を登録';
  el('personalTitle').value=item?.title||'';
  el('personalDate').value=item?.date||selectedCalendarDate||'';
  el('personalTime').value=item?.time||'';
  el('personalMemo').value=item?.memo||'';
  showPage('schedule');showScheduleView('personal');
  el('personalScheduleForm').scrollIntoView({behavior:'smooth',block:'start'});
}
el('addPersonalSchedule').addEventListener('click',()=>openPersonalSchedule());
el('cancelPersonalSchedule').addEventListener('click',()=>showScheduleView('calendar'));
el('savePersonalSchedule').addEventListener('click',()=>{
  const title=el('personalTitle').value.trim(),date=el('personalDate').value;
  if(!title||!date){alert('タイトルと日付を入力してね。');return;}
  const entry={id:editingPersonalId||makeId(),title,date,time:el('personalTime').value,memo:el('personalMemo').value.trim()};
  const updated=editingPersonalId?personalSchedules.map(p=>p.id===editingPersonalId?entry:p):[...personalSchedules,entry];
  if(!writeData('trpgPersonalSchedulesV15',updated))return;
  personalSchedules=updated;selectedCalendarDate=date;
  const [year,month]=date.split('-').map(Number);displayedDate=new Date(year,month-1,1);
  renderCalendar();showScheduleView('calendar');
});

let editingScenarioId=null;
function openScenarioForm(item=null){
  editingScenarioId=item?.id||null;
  el('scenarioFormTitle').textContent=item?'シナリオを編集':'シナリオを追加';
  el('scenarioName').value=item?.name||'';
  el('scenarioStatus').value=item?.status||'未所持';
  el('scenarioSource').value=item?.source||'';
  el('scenarioRoom').value=item?.room||'';
  el('scenarioMemo').value=item?.memo||'';
  el('scenarioStar').checked=!!item?.star;
  closeScenarioPreview();
  el('scenarioForm').classList.remove('hidden');
  el('scenarioForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function safeLink(url,label){
  if(!/^https:\/\//i.test(url))return null;
  const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';return a;
}
// シナリオは「一覧 → プレビュー → 編集」の順に確認できる。
let previewScenarioId=null;
function closeScenarioPreview(){
  el('scenarioPreview').classList.add('hidden');
  el('scenarioList').classList.remove('hidden');
  el('scenarioForm').classList.add('hidden');
}
function openScenarioPreview(item){
  previewScenarioId=item.id;
  const content=el('scenarioPreviewContent');content.replaceChildren();
  previewLine(content,'シナリオ名',item.name);
  previewLine(content,'状態',item.status);
  previewLine(content,'お気に入り',item.star?'★ 登録済み':'未登録');
  previewLine(content,'メモ',item.memo||'未登録');
  [['BOOTH・pixivなど',item.source],['ココフォリアの部屋',item.room]].forEach(([label,url])=>{
    if(!url)return;
    const row=document.createElement('div');row.className='preview-row';
    const title=document.createElement('strong');title.textContent=label;
    const link=safeLink(url,url);if(link)row.append(title,link);
    content.appendChild(row);
  });
  el('scenarioForm').classList.add('hidden');
  el('scenarioList').classList.add('hidden');
  el('scenarioPreview').classList.remove('hidden');
  el('scenarioPreview').scrollIntoView({behavior:'smooth',block:'start'});
}
el('closeScenarioPreview').addEventListener('click',closeScenarioPreview);
el('editPreviewScenario').addEventListener('click',()=>{
  const item=scenarios.find(s=>s.id===previewScenarioId);
  if(item)openScenarioForm(item);
});
function renderScenarios(){
  const target=el('scenarioList');target.replaceChildren();
  const filter=el('scenarioFilter').value;
  const items=scenarios.filter(s=>filter==='すべて'||s.status===filter)
    .sort((a,b)=>Number(!!b.star)-Number(!!a.star)||(a.order??0)-(b.order??0));
  el('scenarioCount').textContent=`${items.length}件`;
  if(!items.length){const p=document.createElement('p');p.className='help-text';p.textContent='登録されたシナリオはありません。';target.appendChild(p);return;}
  items.forEach(item=>{
    const card=document.createElement('article');card.className='scenario-card';
    const top=document.createElement('div');top.className='scenario-card-top';
    const star=document.createElement('button');star.type='button';star.className='scenario-star'+(item.star?' on':'');star.textContent=item.star?'★':'☆';star.setAttribute('aria-label','お気に入り切替');
    star.addEventListener('click',()=>{
      const updated=scenarios.map(s=>s.id===item.id?{...s,star:!s.star}:s);
      if(writeData('trpgScenarioLibraryV15',updated)){scenarios=updated;renderScenarios();}
    });
    const name=document.createElement('strong');name.textContent=item.name;
    const badge=document.createElement('span');badge.className='scenario-status';badge.textContent=item.status;
    top.append(star,name,badge);card.appendChild(top);
    const actions=document.createElement('div');actions.className='session-actions';
    const edit=document.createElement('button');edit.type='button';edit.className='secondary-button';edit.textContent='編集';edit.addEventListener('click',()=>openScenarioForm(item));
    const del=document.createElement('button');del.type='button';del.className='delete-button';del.textContent='削除';del.addEventListener('click',()=>{
      if(!confirm(`「${item.name}」を削除しますか？`))return;
      const updated=scenarios.filter(s=>s.id!==item.id);
      if(writeData('trpgScenarioLibraryV15',updated)){scenarios=updated;renderScenarios();}
    });
    const preview=document.createElement('button');preview.type='button';preview.className='secondary-button';preview.textContent='プレビュー';preview.addEventListener('click',()=>openScenarioPreview(item));
    actions.append(preview,edit,del);card.appendChild(actions);target.appendChild(card);
  });
}
el('newScenarioButton').addEventListener('click',()=>openScenarioForm());
el('cancelScenario').addEventListener('click',()=>el('scenarioForm').classList.add('hidden'));
el('scenarioFilter').addEventListener('change',renderScenarios);
el('saveScenario').addEventListener('click',()=>{
  const name=el('scenarioName').value.trim();if(!name){alert('シナリオ名を入力してね。');return;}
  const source=el('scenarioSource').value.trim(),room=el('scenarioRoom').value.trim();
  if([source,room].some(url=>url&&!/^https:\/\//i.test(url))){alert('URLはhttps://から始まるものを入力してね。');return;}
  const old=scenarios.find(s=>s.id===editingScenarioId);
  const item={id:editingScenarioId||makeId(),name,status:el('scenarioStatus').value,source,room,memo:el('scenarioMemo').value.trim(),star:el('scenarioStar').checked,order:old?.order??Date.now()};
  const updated=editingScenarioId?scenarios.map(s=>s.id===editingScenarioId?item:s):[...scenarios,item];
  if(!writeData('trpgScenarioLibraryV15',updated))return;
  scenarios=updated;el('scenarioForm').classList.add('hidden');renderScenarios();
});
renderScenarios();


/* Ver.0.20：端末内データのバックアップ・復元。
   JSON形式のテキストを .txt で保存。IndexedDBの画像もData URLとして同梱する。 */
const BACKUP_KEYS=['trpgSessions','trpgCharactersV02','trpgPersonalSchedulesV15','trpgScenarioLibraryV15'];
function backupMessage(message){el('backupMessage').textContent=message;}
function openBackupPanel(){el('backupPanel').classList.remove('hidden');backupMessage('');}
el('openBackup').addEventListener('click',openBackupPanel);
el('mobileBackupNav').addEventListener('click',openBackupPanel);
el('closeBackup').addEventListener('click',()=>el('backupPanel').classList.add('hidden'));
el('backupPanel').addEventListener('click',e=>{if(e.target===el('backupPanel'))el('backupPanel').classList.add('hidden');});
function fileAsDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
function dataURLToBlob(url){
  if(typeof url!=='string'||!/^data:[^,]*;base64,/.test(url))throw new Error('画像データの形式が正しくありません');
  const [header,payload]=url.split(',',2),mime=header.slice(5).split(';')[0]||'application/octet-stream';
  const bytes=atob(payload);const data=new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++)data[i]=bytes.charCodeAt(i);
  return new Blob([data],{type:mime});
}
async function getAllBackupImages(){
  const db=await openImageDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readonly');const req=tx.objectStore('images').getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>db.close();
  });
}
async function replaceBackupImages(records){
  const db=await openImageDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');const store=tx.objectStore('images');
    store.clear();for(const record of records)store.put(record);
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('画像の復元が中断されました'));};
  });
}
el('exportBackup').addEventListener('click',async()=>{
  const button=el('exportBackup');button.disabled=true;backupMessage('書き出し中…');
  try{
    const data={};for(const key of BACKUP_KEYS)data[key]=readData(key);
    const images=await getAllBackupImages();const packed=[];
    for(const item of images)packed.push({id:item.id,sessionId:item.sessionId,name:item.name,dataURL:await fileAsDataURL(item.blob)});
    const backup={format:'trpg-manager-backup',version:1,exportedAt:new Date().toISOString(),data,images:packed};
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`卓の手帳_バックアップ_${new Date().toLocaleDateString('sv-SE')}.txt`;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    backupMessage(`書き出しを開始しました（画像${images.length}件）。ダウンロードしたTXTを安全な場所に保管してね。`);
  }catch(error){console.error(error);backupMessage('書き出しに失敗しました。保存容量やブラウザの設定を確認してください。');}
  finally{button.disabled=false;}
});
el('importBackup').addEventListener('change',async e=>{
  const input=e.target,file=input.files?.[0];if(!file)return;
  try{
    if(file.size>250*1024*1024)throw new Error('ファイルが大きすぎます（250MBまで）');
    const backup=JSON.parse(await file.text());
    if(backup?.format!=='trpg-manager-backup'||backup.version!==1||!backup.data||!Array.isArray(backup.images))throw new Error('卓の手帳のバックアップTXTではありません');
    for(const key of BACKUP_KEYS)if(!Array.isArray(backup.data[key]))throw new Error('必要なデータが不足しています: '+key);
    const images=backup.images.map(item=>{
      if(!item||typeof item.id!=='string'||typeof item.sessionId!=='string'||typeof item.name!=='string')throw new Error('画像情報が不正です');
      return {id:item.id,sessionId:item.sessionId,name:item.name,blob:dataURLToBlob(item.dataURL)};
    });
    if(!confirm(`このTXTから復元しますか？\n卓 ${backup.data.trpgSessions.length}件 / 探索者 ${backup.data.trpgCharactersV02.length}件 / 個人予定 ${backup.data.trpgPersonalSchedulesV15.length}件 / シナリオ ${backup.data.trpgScenarioLibraryV15.length}件 / 画像 ${images.length}件\n\n現在のデータはすべて置き換わります。`))return;
    backupMessage('復元中…画面を閉じないでください。');
    // 失敗時に可能な限り元のデータに戻す。
    const previous={};for(const key of BACKUP_KEYS)previous[key]=localStorage.getItem(key);
    const oldImages=await getAllBackupImages();
    try{
      await replaceBackupImages(images);
      for(const key of BACKUP_KEYS)localStorage.setItem(key,JSON.stringify(backup.data[key]));
    }catch(error){
      for(const key of BACKUP_KEYS){try{if(previous[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[key]);}catch(e){console.error(e);}}
      try{await replaceBackupImages(oldImages);}catch(e){console.error('画像の巻き戻しに失敗',e);}
      throw error;
    }
    alert('復元が完了しました。画面を再読み込みします。');location.reload();
  }catch(error){console.error(error);backupMessage('復元できませんでした：'+error.message);}
  finally{input.value='';}
});
