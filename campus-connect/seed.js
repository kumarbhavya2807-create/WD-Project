'use strict';
// Seed data: clubs, committees, their events, demo students and informal meetups.
const crypto = require('crypto');

const pad = n => String(n).padStart(2, '0');
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const uid = p => p + crypto.randomBytes(4).toString('hex');

const ORGS = [
  ['adaa', 'Adaa', 'Club', 'AD'], ['amplifi', 'Amplif-i', 'Club', 'AM'], ['analytica', 'Analytica', 'Club', 'AN'],
  ['appli', 'Appl-i', 'Club', 'AP'], ['blueocean', 'BlueOcean', 'Club', 'BO'], ['economi', 'Econom-i', 'Club', 'EC'],
  ['fic', 'Finance & Investment Club', 'Club', 'FI'], ['impulse', 'Impulse', 'Club', 'IM'], ['inquizit', 'Inquizit-I', 'Club', 'IQ'],
  ['literari', 'Literar-i', 'Club', 'LI'], ['photon', 'Photon', 'Club', 'PH'],
  ['cultural', 'Cultural Committee', 'Committee', 'CC'], ['infra', 'Infrastructure Committee', 'Committee', 'IC'],
  ['sports', 'Sports Committee', 'Committee', 'SC'], ['aasha', 'Social Impact Committee (Aasha)', 'Committee', 'SI'],
  ['ecell', 'E-Cell', 'Committee', 'EL'], ['mpa', 'Media, PR & Alumni Committee', 'Committee', 'MP']
].map(([id, name, type, short]) => ({ id, name, type, short }));

const R = (name, type, description, due) => ({ name, type, description, dueDate: due == null ? null : addDays(due) });

// org, title, category, mode, venue, eventOffset, deadlineOffset, teamMin, teamMax, capacity, featured, description, prize, rounds
const EVENTS = [
  ['adaa', 'Nukkad Naatak Practice', 'Cultural', 'Offline', 'Open Air Amphitheatre', 6, 3, 4, 10, 60, false,
    'Join Adaa for an open street-play practice. Form a troupe, bring a 5-minute script idea and rehearse with feedback from seniors ahead of the annual Nukkad showcase.', 'Slot in the annual Nukkad showcase',
    [R('Script idea submission', 'submission', 'Upload a one-page synopsis of your nukkad theme.', 3), R('Practice showcase', 'live', 'Perform a 5-minute act in front of the Adaa panel.')]],
  ['amplifi', 'Jamming Session', 'Cultural', 'Offline', 'Music Room, Block B', 5, 3, 1, 5, 40, false,
    'An open jam for singers, guitarists, drummers and everything in between. Register solo or as a band and take the stage at the weekly Amplif-i jam night.', 'Feature slot at Amplif-i Live',
    [R('Audition clip', 'submission', 'Share a 60-second clip (link or file) of you or your band.', 3), R('Jam night', 'live', 'Perform two songs live.')]],
  ['analytica', 'Guesstimate', 'Business', 'Online', 'Microsoft Teams', 8, 5, 1, 2, 100, false,
    'Estimate the unestimable! Market-sizing and guesstimate questions in the style of consulting interviews. Solo or pairs.', 'Certificates + Analytica goodies',
    [R('Written guesstimates', 'submission', 'Solve three guesstimates and upload your working as a PDF.', 5), R('Live guesstimate finals', 'live', 'Present your approach live to a panel.')]],
  ['appli', 'Triad Takeover Case Comp', 'Tech', 'Offline', 'Seminar Hall 2', 14, 9, 3, 4, 90, true,
    'A product-and-tech case competition in teams of three or four. Craft a go-to-market and tech roadmap for a real campus problem and pitch to industry judges.', 'Prize pool Rs 30,000 + internship interviews',
    [R('Ideation deck', 'submission', 'Submit a 10-slide deck outlining your solution.', 9), R('Prototype pitch', 'submission', 'Upload a prototype link and a 3-minute demo video.', 12), R('Grand finale', 'live', 'Final pitch in front of industry judges.')]],
  ['blueocean', 'Marketing Marvel Case Comp', 'Business', 'Offline', 'Lecture Theatre 4', 12, 7, 2, 4, 80, true,
    'Build a marketing strategy for a brand under real constraints. Positioning, channels, budget, and a creative hook. Top teams present live.', 'Rs 20,000 + brand mentorship',
    [R('Strategy deck', 'submission', 'Upload your marketing strategy deck (max 12 slides).', 7), R('Live pitch', 'live', 'Pitch your plan to the BlueOcean panel.')]],
  ['economi', 'Microeconomics Exam Revision', 'Study', 'Online', 'Google Meet', 3, 2, 1, 1, 150, false,
    'A guided revision marathon covering demand, cost, market structures and game theory. Solve past-paper problems with Econom-i seniors.', 'Revision pack for all attendees',
    [R('Revision session', 'live', 'Join the live session and solve problems with mentors.')]],
  ['fic', 'FinOpoly', 'Business', 'Offline', 'Finance Lab', 10, 6, 2, 3, 60, false,
    'A finance-themed board game where you buy firms, manage risk and respond to market shocks. Learn valuation by playing.', 'Trophies + investing workshop passes',
    [R('Prelims quiz', 'live', 'A rapid-fire finance quiz to select the top teams.'), R('FinOpoly finals', 'live', 'Play the board game finals.')]],
  ['impulse', 'Dance Practice', 'Cultural', 'Offline', 'Dance Studio', 4, 2, 1, 8, 50, false,
    'Open practice for all dance forms ahead of the annual showcase. Come solo or with a crew and work on your choreography.', 'Showcase slot at the annual fest',
    [R('Choreography preview', 'live', 'Show a 2-minute preview to the Impulse core team.')]],
  ['inquizit', 'Freshers Quiz', 'Study', 'Offline', 'Main Auditorium', 9, 6, 1, 3, 120, false,
    'The campus-wide quiz for freshers: general knowledge, pop culture, business and sports. Teams of up to three.', 'Gift hampers',
    [R('Written prelims', 'live', 'A written round to pick the top six teams.'), R('Stage finals', 'live', 'Buzzer-round finals on stage.')]],
  ['literari', 'BizTech Round Table', 'Tech', 'Offline', 'Conference Room 1', 11, 8, 1, 1, 40, false,
    'A moderated round table on AI, fintech and the future of business. Submit your position note and debate with peers.', 'Certificate of participation + networking dinner',
    [R('Position note', 'submission', 'Upload a 1-page position note on the theme.', 8), R('Round table', 'live', 'Participate in the moderated discussion.')]],
  ['photon', 'Campus Photo Walk', 'Cultural', 'Offline', 'Main Gate', 7, 5, 1, 2, 50, false,
    'A guided golden-hour walk around campus. Shoot, edit and submit your best three frames for the Photon gallery.', 'Gallery feature + prints',
    [R('Photo walk', 'live', 'Join the walk at the main gate.'), R('Photo submission', 'submission', 'Submit your best three frames.', 11)]],
  ['cultural', 'Diwali', 'Cultural', 'Offline', 'Central Lawn', 20, 12, 1, 6, 300, true,
    'The Diwali night. Rangoli, diya decoration, performances and food. Register your act or your team for the cultural evening.', 'Trophies for best performance',
    [R('Act proposal', 'submission', 'Submit details of your act or stall.', 12), R('Auditions', 'live', 'Audition in front of the Cultural Committee.'), R('Diwali Night', 'live', 'Final performances.')]],
  ['infra', 'Infra Case Quest', 'Business', 'Offline', 'Seminar Hall 1', 15, 10, 2, 4, 80, false,
    'Solve a real infrastructure planning problem: sustainable campus mobility. Teams of two to four.', 'Rs 15,000 + facility visit',
    [R('Case solution', 'submission', 'Submit your written solution (max 8 pages).', 10), R('Finals', 'live', 'Present to the Infrastructure Committee and faculty.')]],
  ['sports', 'Section Wars: Tennis', 'Sports', 'Offline', 'Tennis Court', 8, 4, 1, 2, 32, true,
    'Singles and doubles tennis between sections. Represent your section across group stage, knockouts and the final.', 'Section Wars points + trophy',
    [R('Group stage', 'live', 'Round robin within groups.'), R('Knockouts', 'live', 'Single elimination.'), R('Final', 'live', 'Section Wars final.')]],
  ['aasha', 'E-Impetus', 'Social', 'Hybrid', 'Seminar Hall 3 / Zoom', 18, 13, 2, 4, 60, false,
    'Pitch a social enterprise idea that creates measurable local impact. Mentors from the Aasha network guide shortlisted teams.', 'Seed grant of Rs 25,000',
    [R('Proposal', 'submission', 'Submit a 2-page impact proposal.', 13), R('Pitch', 'live', 'Pitch to the Aasha judges.')]],
  ['ecell', 'Escelon Pitching', 'Business', 'Offline', 'Incubation Centre', 16, 11, 2, 4, 70, true,
    'The flagship E-Cell startup pitching competition. Pitch your idea to angel investors and win mentorship and funding intros.', 'Funding intros + Rs 50,000',
    [R('Idea deck', 'submission', 'Upload your pitch deck (PDF, max 10 slides).', 11), R('Live pitch', 'live', 'Five-minute pitch plus Q&A.')]],
  ['mpa', 'Alumni Session', 'Social', 'Offline', 'Main Auditorium', 13, 9, 1, 1, 150, false,
    'A fireside conversation with alumni from consulting, product and startups. Register for a seat and submit questions.', 'Networking opportunity',
    [R('Alumni session', 'live', 'Attend the session and ask questions.')]]
];

const STUDENTS = [
  ['Demo Student', 'demo@college.edu', 'S2024001'], ['Bhavya Kumar', 'bhavya@college.edu', 'S2023014'],
  ['Rohan Mehta', 'rohan@college.edu', 'S2024022'], ['Ananya Iyer', 'ananya@college.edu', 'S2024037'],
  ['Kabir Shah', 'kabir@college.edu', 'S2023051'], ['Meera Nair', 'meera@college.edu', 'S2024063'],
  ['Aarav Singh', 'aarav@college.edu', 'S2024071'], ['Isha Verma', 'isha@college.edu', 'S2023088']
];

const MEETUPS = [
  ['PGP vs IPM Football Match', 'Sports', 'Offline', 'Main Football Ground', 4, '17:30', 'bhavya@college.edu',
    'Friendly 7-a-side football, PGP vs IPM. Bring your jersey; teams are picked on the day. Cast your vote if you are in.'],
  ['Cricket Practice', 'Sports', 'Offline', 'Nets, Sports Complex', 2, '07:00', 'rohan@college.edu',
    'Morning nets session for batting and bowling. Beginners welcome. Bring your own kit if you have it.'],
  ['Statistics Sessions with Bhavya Kumar', 'Study', 'Offline', 'Library Discussion Room 3', 3, '19:00', 'bhavya@college.edu',
    'Peer-taught statistics sessions covering probability, distributions and hypothesis testing. Bring your questions and a calculator.']
];

function seed(hashPw, adminPassword) {
  const db = { users: [], orgs: ORGS, events: [], teams: [], submissions: [], meetups: [], announcements: [], saved: [], sessions: {} };
  const mk = (name, email, collegeId, role, orgId, pw) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { id: uid('u_'), name, email, collegeId, role, orgId: orgId || null, salt, hash: hashPw(pw, salt), createdAt: new Date().toISOString() };
    db.users.push(u); return u;
  };
  mk('Super Admin', 'superadmin@college.edu', 'ADMIN000', 'superadmin', null, adminPassword);
  ORGS.forEach((o, i) => mk(o.name + ' Admin', `${o.id}@college.edu`, 'ADM' + String(i + 1).padStart(3, '0'), 'admin', o.id, adminPassword));
  STUDENTS.forEach(([n, e, c]) => mk(n, e, c, 'student', null, 'Student@123'));
  const byEmail = e => db.users.find(u => u.email === e);

  EVENTS.forEach(([org, title, category, mode, venue, evOff, dlOff, tmin, tmax, cap, featured, description, prize, rounds]) => {
    db.events.push({ id: uid('e_'), orgId: org, title, category, mode, venue, eventDate: addDays(evOff), deadline: addDays(dlOff),
      teamMin: tmin, teamMax: tmax, capacity: cap, featured, closed: false, description, prize, eligibility: 'Open to all students of the college.',
      rounds, currentRound: 0, createdAt: new Date().toISOString() });
  });
  const ev = t => db.events.find(e => e.title === t);
  const team = (eventTitle, name, leaderEmail, memberEmails) => {
    const e = ev(eventTitle);
    const members = [leaderEmail, ...memberEmails].map(x => byEmail(x).id);
    db.teams.push({ id: uid('t_'), eventId: e.id, name, code: crypto.randomBytes(3).toString('hex').toUpperCase(), leaderId: members[0], members, status: 'active', roundReached: 0, createdAt: new Date().toISOString() });
  };
  team('Triad Takeover Case Comp', 'Product Pirates', 'bhavya@college.edu', ['rohan@college.edu', 'ananya@college.edu']);
  team('Triad Takeover Case Comp', 'Stack Overflowers', 'kabir@college.edu', ['meera@college.edu', 'aarav@college.edu']);
  team('Marketing Marvel Case Comp', 'Brand Builders', 'ananya@college.edu', ['isha@college.edu']);
  team('Escelon Pitching', 'Seed Round', 'rohan@college.edu', ['kabir@college.edu']);
  team('Section Wars: Tennis', 'Section A Aces', 'meera@college.edu', []);
  team('Section Wars: Tennis', 'Section B Smashers', 'aarav@college.edu', []);
  team('Guesstimate', 'Fermi Fans', 'isha@college.edu', []);
  team('Freshers Quiz', 'Quizzards', 'bhavya@college.edu', ['rohan@college.edu']);
  team('Alumni Session', 'Ananya Iyer', 'ananya@college.edu', []);

  MEETUPS.forEach(([title, category, mode, venue, off, time, host, description]) => {
    const h = byEmail(host);
    db.meetups.push({ id: uid('m_'), title, category, mode, venue, date: addDays(off), time, description, hostId: h.id, votes: {}, createdAt: new Date().toISOString() });
  });
  db.meetups[0].votes = { [byEmail('rohan@college.edu').id]: 'in', [byEmail('kabir@college.edu').id]: 'in', [byEmail('meera@college.edu').id]: 'maybe' };
  db.meetups[2].votes = { [byEmail('ananya@college.edu').id]: 'in' };

  const sa = byEmail('superadmin@college.edu');
  db.announcements.push(
    { id: uid('a_'), text: 'Registrations for Triad Takeover and Marketing Marvel case competitions close this week. Form your teams now.', type: 'info', orgId: null, active: true, createdAt: new Date().toISOString(), authorId: sa.id },
    { id: uid('a_'), text: 'Diwali Night auditions open soon. Submit your act proposal before the deadline.', type: 'event', orgId: 'cultural', active: true, createdAt: new Date().toISOString(), authorId: sa.id }
  );
  return db;
}

module.exports = { seed, ORGS };
