// --- GESTIONE DATABASE (PropertiesService) ---

function getDb(key, defaultData) {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty(key);
  return saved ? JSON.parse(saved) : defaultData;
}

function saveDb(key, data) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(data));
}

// --- DATI INIZIALI ---

function getInitialUsers() {
  return [
    { 
      email: "marcotrallalla@gmail.com", pass: "12345", role: "student", 
      nome: "Marco", cognome: "Mammoliti", matricola: "1137085", 
      programma: "Allievi",
      corsoLaurea: "Economia e Commercio", dataNascita: "1998-05-12", dataIscrizione: "2023-09-01",
      img: "",
      carriera: [ 
        { corsoId: "ECO01", nomeEsame: "Storia Economica", voto: 28, cfu: 9, data: "2024-01-10" },
        { corsoId: "MAT01", nomeEsame: "Metodi Matematici", voto: 24, cfu: 12, data: "2024-02-15" },
        { corsoId: "DIR01", nomeEsame: "Diritto Privato", voto: 30, cfu: 6, data: "2024-06-20" }
      ],
      notifiche: []
    },
    { email: "prof@carloalberto.org", pass: "prof", role: "teacher", nome: "Luca", cognome: "Anselma", matricola: "DOC-001", img: "", notifiche: [] },
    { email: "admin@carloalberto.org", pass: "admin", role: "admin", nome: "Segreteria", cognome: "Didattica", matricola: "ADM-001", img: "", notifiche: [] }
  ];
}

// --- FUNZIONI DI RECUPERO DATI ---

function getAllTeachersDB() {
  const users = getDb('DB_USERS', getInitialUsers());
  return users.filter(u => u.role === 'teacher').map(t => ({
    nome: t.nome,
    cognome: t.cognome,
    email: t.email
  }));
}

function getAllStudentsDB(programmaFilter = null) {
  const users = getDb('DB_USERS', getInitialUsers());
  let students = users.filter(u => u.role === 'student');
  
  if(programmaFilter && programmaFilter !== 'Tutti') {
    students = students.filter(s => s.programma === programmaFilter);
  }
  
  return students.map(s => ({
    nome: s.nome,
    cognome: s.cognome,
    email: s.email,
    programma: s.programma,
    matricola: s.matricola
  }));
}

function loginUser(email, password) {
  const users = getDb('DB_USERS', getInitialUsers());
  const user = users.find(u => u.email === email && u.pass === password);
  return prepareUserForClient(user);
}

function loginUserBypass(email) {
  const users = getDb('DB_USERS', getInitialUsers());
  const user = users.find(u => u.email === email);
  return prepareUserForClient(user);
}

function prepareUserForClient(user) {
  if (user) {
    // Prepara l'array di notifiche per il frontend
    if (!user.notifiche) {
      user.notifiche = [];
    }
  }
  return user ? user : null;
}

// --- FUNZIONI DI AGGIORNAMENTO E CREAZIONE ---

function createNewUserDB(form) {
  let users = getDb('DB_USERS', getInitialUsers());
  
  if (users.some(u => u.email === form.email)) {
    return { success: false, error: "Email già registrata nel sistema." };
  }

  let newUser = {
    role: form.role,
    email: form.email,
    pass: form.password,
    nome: form.nome,
    cognome: form.cognome,
    img: "",
    notifiche: [],
    dataIscrizione: new Date().toISOString().split('T')[0]
  };

  if (form.role === 'student') {
    newUser.matricola = form.matricola;
    newUser.programma = form.programma;
    newUser.carriera = [];
  }

  users.push(newUser);
  PropertiesService.getScriptProperties().setProperty('DB_USERS', JSON.stringify(users));
  
  return { success: true };
}

function updateUserImg(email, url) {
  let users = getDb('DB_USERS', getInitialUsers());
  let u = users.find(x => x.email === email);
  if(u) { 
    u.img = url; 
    saveDb('DB_USERS', users); 
  }
}

// --- DATI SPECIFICI PER RUOLO ---

function getStudentData(email) {
  const users = getDb('DB_USERS', getInitialUsers());
  const user = users.find(u => u.email === email);
  if (!user) return null;

  let totaleVoti = 0, totaleCFU = 0, sommaPonderata = 0;
  const cfuTarget = 180;

  if (user.carriera && user.carriera.length > 0) {
    user.carriera.forEach(esame => {
      let v = parseInt(esame.voto);
      let c = parseInt(esame.cfu);
      totaleVoti += v;
      totaleCFU += c;
      sommaPonderata += (v * c);
    });
  }
  
  const media = totaleCFU > 0 ? (sommaPonderata / totaleCFU).toFixed(1) : 0;
  const cfuMancanti = cfuTarget - totaleCFU;
  const percCompletamento = Math.min(100, Math.round((totaleCFU / cfuTarget) * 100));

  return { 
    nome: user.nome,
    matricola: user.matricola,
    programma: user.programma,
    media: media, 
    cfu: totaleCFU,
    cfuTarget: cfuTarget,
    cfuMancanti: cfuMancanti,
    perc: percCompletamento,
    libretto: user.carriera || []
  };
}

function getTeacherData(email) {
  const users = getDb('DB_USERS', getInitialUsers());
  const user = users.find(u => u.email === email);
  
  if (user && user.role === 'teacher') {
    return { 
      nome: user.nome,
      cognome: user.cognome,
      email: user.email,
      accessDisabled: true,
      message: "L'accesso dell'area docente è stato disabilitato. Per comunicazioni con gli studenti, utilizza la sezione Contatti."
    };
  }
  
  return { corsi: [], appelli: [] };
}

function adminGetDataBundle() {
  const users = getDb('DB_USERS', getInitialUsers());
  const listaAule = ["Aula Magna", "Laboratorio Info", "Aula 3B", "Aula Studio"];
  return { users: users.map(u => ({role: u.role, email: u.email, nome: u.nome})), aule: listaAule };
}

// --- FUNZIONI ADMIN ---

function adminSendNotif(msg) { 
  let users = getDb('DB_USERS', getInitialUsers());
  
  const newNotif = {
    id: Date.now(),
    messaggio: msg,
    letto: false,
    data: new Date().toISOString(),
    tipo: 'globale'
  };
  
  users = users.map(u => {
    if (!u.notifiche) {
      u.notifiche = [];
    }
    u.notifiche.push(newNotif);
    return u;
  });
  
  saveDb('DB_USERS', users); 
  
  return "Notifica globale inviata a tutti gli utenti!"; 
}

// --- NOTIFICHE PERSONALIZZATE PER UTENTE SINGOLO ---

function adminSendNotifToUser(userEmail, msg) {
  try {
    let users = getDb('DB_USERS', getInitialUsers());
    let user = users.find(u => u.email === userEmail);
    
    if(user) {
      if (!user.notifiche) {
        user.notifiche = [];
      }
      
      const newNotif = {
        id: Date.now(),
        messaggio: msg,
        letto: false,
        data: new Date().toISOString(),
        tipo: 'personale'
      };
      
      user.notifiche.push(newNotif);
      saveDb('DB_USERS', users);
      return true;
    }
    return false;
  } catch (e) {
    console.error("Errore invio notifica utente: " + e.message);
    return false;
  }
}

// Segna una notifica come letta per ID
function dismissNotificationById(email, notifId) {
  let users = getDb('DB_USERS', getInitialUsers());
  let u = users.find(x => x.email === email);
  if (u && u.notifiche) { 
    let notif = u.notifiche.find(n => n.id === parseInt(notifId));
    if (notif) {
      notif.letto = true;
      saveDb('DB_USERS', users);
      return true;
    }
  }
  return false;
}

// Elimina definitivamente una notifica per ID
function deleteNotificationById(email, notifId) {
  let users = getDb('DB_USERS', getInitialUsers());
  let u = users.find(x => x.email === email);
  if (u && u.notifiche) { 
    u.notifiche = u.notifiche.filter(n => n.id !== parseInt(notifId));
    saveDb('DB_USERS', users);
    return true;
  }
  return false;
}
