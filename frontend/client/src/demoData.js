import { clinicToday } from '../../shared/formRules.mjs';

export const demoPassword = 'DemoPass123!';

// Fictional fixtures only. Never generate these from a local database or .env.
export function createDemoData(now = new Date()) {
  const today = clinicToday(now);
  const day = offset => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const accounts = [
    ['demo.receptionist', 'Receptionist', 'Jamie', 'Santos', 'approved'],
    ['demo.secretary', 'Medical Secretary', 'Casey', 'Reyes', 'approved'],
    ['demo.admin', 'Super Admin', 'Robin', 'Garcia', 'approved'],
    ['demo.pending', 'Receptionist', 'Taylor', 'Ramos', 'pending'],
  ].map(([username, role, firstName, lastName, status]) => ({
    username, role, firstName, lastName, middleName: '', status,
    address: 'Sample Street, Demo City', phone: '+639170000000',
    email: `${username}@gmail.com`, doctorId: '', createdAt: now.toISOString(),
  }));
  const doctors = [
    { id: 'DEMO-DOC-1', name: 'Dr. Elena Cruz', specialty: 'General Health' },
    { id: 'DEMO-DOC-2', name: 'Dr. Marco Reyes', specialty: 'Cardiologist' },
  ].map(doctor => ({ ...doctor, active: true, phone: '+639180000000', email: '', secretaryUsername: '', doctorUsername: '' }));
  const patients = ['Alex Rivera', 'Sam Mendoza', 'Jordan Flores'].map((name, index) => ({
    id: `DEMO-PT-${index + 1}`, name, age: 34 - (today.slice(5) < '04-12' ? 1 : 0),
    birthday: `${Number(today.slice(0, 4)) - 34}-04-12`, sex: index === 1 ? 'Female' : 'Male',
    contact: `+63917000000${index}`, email: '', address: 'Sample Street, Demo City',
    emergencyName: 'Morgan Rivera', emergencyContact: '+639180000000', emergencyRelationship: 'Sibling',
    status: index === 2 ? 'Completed' : 'Waiting',
    vitals: { bp: '120/80', hr: '72', temp: '36.5', respRate: '18', spo2: '98', weight: '68', height: '172' },
    medicalHistory: { allergies: 'None reported (sample)', conditions: '', medications: '' },
    consultation: {}, medical: {}, visits: [], recordNotes: [], appointments: [],
  }));
  const appointments = patients.map((patient, index) => ({
    id: `DEMO-APPT-${index + 1}`, patientId: patient.id, patientName: patient.name,
    age: patient.age, sex: patient.sex, contact: patient.contact, address: patient.address,
    email: '', emergencyName: patient.emergencyName, emergencyContact: patient.emergencyContact,
    emergencyRelationship: 'Sibling', doctor: doctors[index % 2].name, doctorId: doctors[index % 2].id,
    date: day(index === 2 ? -1 : 0), time: ['09:00', '10:00', '11:00'][index],
    type: index === 2 ? 'Follow-up' : 'Routine Checkup',
    status: index === 2 ? 'Completed' : 'Confirmed',
    visitStatus: index === 2 ? 'Completed' : 'Waiting', room: 'Demo Room', notes: 'Fictional appointment for preview.',
  }));
  for (const patient of patients) patient.appointments = appointments.filter(item => item.patientId === patient.id);
  const schedules = Object.fromEntries(doctors.flatMap(doctor => [0, 1].map(offset => {
    const date = day(offset);
    return [`${doctor.name}|${date}`, { doctor: doctor.name, date, start: '08:00', end: '17:00', blocked: {}, blockedPeriods: [] }];
  })));
  return { accounts, state: { patients, appointments, schedules, doctors } };
}
