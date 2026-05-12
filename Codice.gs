function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('Collegio Carlo Alberto')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- INTEGRAZIONI ---
function getClassroomCourses() {
  try {
    const studentRes = Classroom.Courses.list({ courseStates: ['ACTIVE'], studentId: 'me' });
    const teacherRes = Classroom.Courses.list({ courseStates: ['ACTIVE'], teacherId: 'me' });

    const all = [...(studentRes.courses || []), ...(teacherRes.courses || [])];
    return Array.from(new Map(all.map(c => [c.id, c])).values());
  } catch (e) {
    console.error("Errore Classroom API: " + e.message);
    return []; 
  }
}

function uploadProfileImage(data, mimeType, fileName, userEmail) {
  try {
    const dataBlob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, fileName);
    const folderName = "CCA_User_Images";
    const folders = DriveApp.getFoldersByName(folderName);
    let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    const file = folder.createFile(dataBlob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileUrl = "https://drive.google.com/thumbnail?sz=w800&id=" + file.getId();
    
    updateProfileImageDB(userEmail, fileUrl);
    return { success: true, url: fileUrl };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// --- MAPPING EMAIL TICKET ---
const TICKET_EMAILS = {
  "prenotazione_aula": "reception@carloalberto.org",
  "info_didattica_allievi": "irma.evola@carloalberto.org",
  "info_didattica_master": "irma.evola@carloalberto.org",
  "info_didattica_dottorandi": "davide.pochettino@carloalberto.org",
  "problemi_it": "alberto.galvan@carloalberto.org",
  "altro": "segreteria@carloalberto.org"
};

// --- TICKET SYSTEM ---
function sendTicketRequest(form) {
  try {
    let recipient = TICKET_EMAILS[form.tipoTicket] || "segreteria@carloalberto.org";
    
    const subject = `[CCA Ticket] ${form.tipoTicket} - da ${form.user}`;
    const body = `
      Nuovo Ticket da App CCA.
      
      Utente: ${form.user}
      Tipo Ticket: ${form.tipoTicket}
      Messaggio:
      ${form.note}
      
      ---
      Inviato automaticamente da CCA App
    `;
    
    GmailApp.sendEmail(recipient, subject, body);
    return "Ticket inviato con successo.";
  } catch (e) {
    return "Errore invio: " + e.message;
  }
}

// --- INVIO EMAIL MASSIVO (ADMIN) ---
function sendBulkEmail(recipients, message) {
  try {
    recipients.forEach(email => {
      GmailApp.sendEmail(email, "Messaggio dal Collegio Carlo Alberto", message);
    });
    return `Email inviata con successo a ${recipients.length} ${recipients.length === 1 ? 'destinatario' : 'destinatari'}.`;
  } catch (e) {
    return "Errore invio: " + e.message;
  }
}

// --- NOTIFICHE BULK (con opzione APP + EMAIL) ---
function sendBulkNotification(recipients, message, notificationType) {
  try {
    if(notificationType === 'email' || notificationType === 'both') {
      recipients.forEach(email => {
        GmailApp.sendEmail(email, "Notifica dal Collegio Carlo Alberto", message);
      });
    }
    
    if(notificationType === 'app' || notificationType === 'both') {
      adminSendNotif(message);
    }
    
    const tipo = notificationType === 'both' ? 'email e app' : notificationType;
    return `Notifica inviata via ${tipo} a ${recipients.length} ${recipients.length === 1 ? 'destinatario' : 'destinatari'}.`;
  } catch (e) {
    return "Errore invio: " + e.message;
  }
}

// --- NOTIFICHE PERSONALIZZATE PER SINGOLO/GRUPPO CON NOME ---
function sendNotificationToUser(recipientEmail, recipientName, message, notificationType) {
  try {
    const adminName = "Admin Collegio";
    const personalizedMsg = `📢 Messaggio privato da ${adminName}: ${message}`;
    
    if(notificationType === 'email' || notificationType === 'both') {
      GmailApp.sendEmail(recipientEmail, "Messaggio Personale dal Collegio Carlo Alberto", 
        `Caro/a ${recipientName},\n\n${personalizedMsg}\n\n---\nInviato automaticamente da CCA App`);
    }
    
    if(notificationType === 'app' || notificationType === 'both') {
      adminSendNotifToUser(recipientEmail, personalizedMsg);
    }
    
    return true;
  } catch (e) {
    console.error("Errore invio notifica: " + e.message);
    return false;
  }
}

function sendNotificationToGroup(recipients, message, notificationType) {
  try {
    const adminName = "Admin Collegio";
    const personalizedMsg = `📢 Messaggio privato da ${adminName}: ${message}`;
    
    recipients.forEach(r => {
      if(notificationType === 'email' || notificationType === 'both') {
        GmailApp.sendEmail(r.email, "Messaggio Personale dal Collegio Carlo Alberto", 
          `Caro/a ${r.nome},\n\n${personalizedMsg}\n\n---\nInviato automaticamente da CCA App`);
      }
      
      if(notificationType === 'app' || notificationType === 'both') {
        adminSendNotifToUser(r.email, personalizedMsg);
      }
    });
    
    return true;
  } catch (e) {
    console.error("Errore invio notifica gruppo: " + e.message);
    return false;
  }
}

function apiSendNotification(recipientEmails, recipientNames, message, notificationType) {
  try {
    if(recipientEmails.length === 1) {
      sendNotificationToUser(recipientEmails[0], recipientNames[0], message, notificationType);
    } else {
      const recipients = recipientEmails.map((email, idx) => ({email: email, nome: recipientNames[idx]}));
      sendNotificationToGroup(recipients, message, notificationType);
    }
    
    const tipo = notificationType === 'both' ? 'email e app' : notificationType;
    return `Notifica inviata via ${tipo} a ${recipientEmails.length} ${recipientEmails.length === 1 ? 'destinatario' : 'destinatari'}.`;
  } catch (e) {
    return "Errore invio: " + e.message;
  }
}

// --- DATA BRIDGES ---
function getClientData(email) {
  const user = loginUserBypass(email); 
  if (!user) return null;
  
  let dashboardData = {};
  const classroomCourses = getClassroomCourses();
  
  if (user.role === 'student') {
    dashboardData = getStudentData(email);
    dashboardData.classroom = classroomCourses.map(c => ({ id: c.id, name: c.name, link: c.alternateLink, section: c.section }));
    dashboardData.teachersList = getAllTeachersDB(); 
    
  } else if (user.role === 'teacher') {
    dashboardData = getTeacherData(email);
    dashboardData.classroom = classroomCourses.map(c => ({ id: c.id, name: c.name, link: c.alternateLink }));
    
  } else if (user.role === 'admin') {
    dashboardData = adminGetDataBundle();
  }

  return { user: user, data: dashboardData };
}

function apiLogin(email, pass) { return loginUser(email, pass); }
function apiDismissNotif(email, notifId) { return dismissNotificationById(email, notifId); }
function apiDeleteNotif(email, notifId) { return deleteNotificationById(email, notifId); }
function apiAdminSendNotif(msg) { return adminSendNotif(msg); }
function updateProfileImageDB(email, url) { updateUserImg(email, url); }

// Funzioni ponte per recuperare docenti e studenti
function getTeachersList() { return getAllTeachersDB(); }
function getStudentsList(programmaFilter) { return getAllStudentsDB(programmaFilter); }

// --- REGISTRAZIONE ---
function apiRegister(form) {
  try {
    if (form.role === 'admin') {
      const ADMIN_SECRET = "CCA_ADMIN_KEY";
      if (form.passKey !== ADMIN_SECRET) {
        return { success: false, error: "Pass Key di riconoscimento Admin non valida." };
      }
    }

    const result = createNewUserDB(form);
    return result;

  } catch (e) {
    return { success: false, error: "Errore nel server: " + e.message };
  }
}
