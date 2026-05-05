import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, Activity, Shield, Search, FileText, 
  LogOut, Plus, ChevronLeft, Calendar, Pill, User as UserIcon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- MOCK DATA (Used for initial seeding if DB is empty) ---
const MOCK_PATIENTS = [
  {
    id: "P1001",
    name: "Rahul Sharma",
    age: 45,
    gender: "Male",
    bloodGroup: "O+",
    contact: "9876543210",
    history: [
      { id: "v1", date: "2026-04-10", doctor: "Dr. Arvind (Cardiology)", diagnosis: "Hypertension", medicines: "Amlodipine 5mg", notes: "Advised low sodium diet. Check BP weekly." },
      { id: "v2", date: "2026-05-01", doctor: "Dr. Arvind (Cardiology)", diagnosis: "Follow-up", medicines: "Amlodipine 5mg", notes: "BP stable at 120/80." }
    ]
  },
  {
    id: "P1002",
    name: "Priya Patel",
    age: 32,
    gender: "Female",
    bloodGroup: "A+",
    contact: "9123456789",
    history: [
      { id: "v3", date: "2026-05-04", doctor: "Dr. Sunita (General)", diagnosis: "Viral Fever", medicines: "Paracetamol 500mg, Vitamin C", notes: "Rest for 3 days. Drink plenty of fluids." }
    ]
  },
  {
    id: "P1003",
    name: "Amit Kumar",
    age: 58,
    gender: "Male",
    bloodGroup: "B-",
    contact: "9988776655",
    history: []
  }
];

export default function App() {
  const [authUser, setAuthUser] = useState(null); // Firebase Auth State
  const [appRole, setAppRole] = useState(null); // Hospital Role: null, { role: 'admin'|'doctor', name: string }
  const [patients, setPatients] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [loadingDb, setLoadingDb] = useState(true);
  
  // 1. Initialize Firebase Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Authentication Error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
    });
    return () => unsubscribe();
  }, []);

  // 2. Sync with Firestore DB
  useEffect(() => {
    if (!authUser) return;

    let hasSeeded = false;
    const patientsRef = collection(db, 'artifacts', appId, 'public', 'data', 'patients');
    
    const unsubscribe = onSnapshot(patientsRef, (snapshot) => {
      // Auto-seed data if collection is empty
      if (snapshot.empty && !hasSeeded) {
        hasSeeded = true;
        MOCK_PATIENTS.forEach(async (p) => {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'patients', p.id), p);
        });
        return;
      }

      const fetchedPatients = [];
      snapshot.forEach(docSnap => {
        fetchedPatients.push(docSnap.data());
      });
      
      setPatients(fetchedPatients);
      setLoadingDb(false);
    }, (error) => {
      console.error("Firestore Listen Error:", error);
      setLoadingDb(false);
    });

    return () => unsubscribe();
  }, [authUser]);

  // --- HANDLERS ---
  const handleLogin = (role, name) => {
    setAppRole({ role, name });
    setActivePatient(null);
  };

  const handleLogout = () => {
    setAppRole(null);
    setActivePatient(null);
  };

  const handleUpdatePatient = async (updatedPatient) => {
    // 1. Optimistic UI update
    setPatients(prev => prev.map(p => p.id === updatedPatient.id ? updatedPatient : p));
    setActivePatient(updatedPatient);

    // 2. Cloud DB update
    if (authUser) {
      try {
        const patientRef = doc(db, 'artifacts', appId, 'public', 'data', 'patients', updatedPatient.id);
        await setDoc(patientRef, updatedPatient);
      } catch (err) {
        console.error("Error saving record to cloud:", err);
      }
    }
  };

  // --- RENDER VIEWS ---
  if (!appRole) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Navigation Bar */}
      <nav className="bg-blue-600 text-white shadow-md p-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6" />
            <span className="font-bold text-xl tracking-tight">MediCare HMS</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-1 text-sm bg-blue-700 px-3 py-1 rounded-full">
              {appRole.role === 'admin' ? <Shield size={14} /> : <UserIcon size={14} />}
              <span>{appRole.name}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="flex items-center space-x-1 text-sm bg-blue-500 hover:bg-blue-700 px-3 py-2 rounded transition"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {loadingDb ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Activity className="animate-pulse h-12 w-12 text-blue-500 mb-4" />
            <p>Syncing secure database...</p>
          </div>
        ) : (
          <>
            {appRole.role === 'admin' && <AdminDashboard patients={patients} />}
            
            {appRole.role === 'doctor' && !activePatient && (
              <DoctorDashboard 
                patients={patients} 
                onSelectPatient={setActivePatient} 
              />
            )}

            {appRole.role === 'doctor' && activePatient && (
              <PatientDetail 
                patient={activePatient} 
                doctorName={appRole.name}
                onBack={() => setActivePatient(null)}
                onUpdatePatient={handleUpdatePatient}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// --- LOGIN SCREEN ---
function LoginScreen({ onLogin }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-600 p-3 rounded-full text-white">
            <Activity size={32} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Hospital Portal</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">Secure access for staff and administration</p>
        
        <div className="space-y-4">
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Doctor Access</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onLogin('doctor', 'Dr. Arvind (Cardiology)')} className="btn-secondary">Dr. Arvind</button>
              <button onClick={() => onLogin('doctor', 'Dr. Sunita (General)')} className="btn-secondary">Dr. Sunita</button>
            </div>
          </div>
          
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Administration</p>
            <button onClick={() => onLogin('admin', 'System Admin')} className="btn-primary w-full flex justify-center items-center">
              <Shield size={16} className="mr-2" /> Admin Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- DOCTOR DASHBOARD ---
function DoctorDashboard({ patients, onSelectPatient }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold mb-4 flex items-center"><Search className="mr-2 text-blue-600" /> Find Patient</h2>
        <div className="relative">
          <Search className="absolute left-3 top-3.5 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by Patient ID or Name..." 
            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 font-semibold text-slate-700">
          Search Results ({filteredPatients.length})
        </div>
        <div className="divide-y divide-slate-100">
          {filteredPatients.length > 0 ? filteredPatients.map(patient => (
            <div key={patient.id} className="p-4 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-lg text-blue-900">{patient.name}</span>
                  <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{patient.id}</span>
                </div>
                <div className="text-sm text-slate-500 mt-1 flex space-x-4">
                  <span>{patient.age} yrs • {patient.gender}</span>
                  <span>Blood: <b className="text-red-500">{patient.bloodGroup}</b></span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Last visit: {patient.history && patient.history.length > 0 ? patient.history[patient.history.length-1].date : 'Never'}
                </div>
              </div>
              <button 
                onClick={() => onSelectPatient(patient)}
                className="btn-primary whitespace-nowrap self-start sm:self-auto"
              >
                View History & Prescribe
              </button>
            </div>
          )) : (
            <div className="p-8 text-center text-slate-400">No patients found matching "{searchTerm}"</div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- PATIENT DETAIL & HISTORY ---
function PatientDetail({ patient, doctorName, onBack, onUpdatePatient }) {
  const [showForm, setShowForm] = useState(false);
  
  // New Visit Form State
  const [diagnosis, setDiagnosis] = useState('');
  const [medicines, setMedicines] = useState('');
  const [notes, setNotes] = useState('');

  const handleSaveVisit = (e) => {
    e.preventDefault();
    const newVisit = {
      id: "v" + Date.now(),
      date: new Date().toISOString().split('T')[0],
      doctor: doctorName,
      diagnosis,
      medicines,
      notes
    };

    const updatedPatient = {
      ...patient,
      history: [...(patient.history || []), newVisit]
    };

    onUpdatePatient(updatedPatient);
    setShowForm(false);
    setDiagnosis('');
    setMedicines('');
    setNotes('');
  };

  const safeHistory = patient.history || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <button onClick={onBack} className="flex items-center text-blue-600 hover:text-blue-800 font-medium transition">
        <ChevronLeft size={20} /> Back to Search
      </button>

      {/* Patient Info Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">{patient.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="bg-slate-100 px-2 py-1 rounded font-mono">ID: {patient.id}</span>
            <span>{patient.age} years, {patient.gender}</span>
            <span>Blood Group: <strong className="text-red-500">{patient.bloodGroup}</strong></span>
            <span>Contact: {patient.contact}</span>
          </div>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center h-fit">
            <Plus size={18} className="mr-1"/> New Consultation
          </button>
        )}
      </div>

      {/* New Consultation Form */}
      {showForm && (
        <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 shadow-inner">
          <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center">
            <FileText className="mr-2" size={20} /> Record New Visit
          </h3>
          <form onSubmit={handleSaveVisit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Diagnosis</label>
              <input required type="text" value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Acute Bronchitis" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Medicines Prescribed</label>
              <textarea required value={medicines} onChange={e=>setMedicines(e.target.value)} rows="2" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Amoxicillin 500mg, 1x3 times a day for 5 days"></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Doctor's Notes (Optional)</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows="2" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Any additional observations or diet plans..."></textarea>
            </div>
            <div className="flex space-x-3 pt-2">
              <button type="submit" className="btn-primary">Save Medical Record</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Medical History Timeline */}
      <h3 className="text-lg font-bold text-slate-800 border-b pb-2">Complete Medical History</h3>
      
      {safeHistory.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-100 text-center text-slate-500">
          No previous medical history found for this patient.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Reverse array to show newest first */}
          {[...safeHistory].reverse().map((visit) => (
            <div key={visit.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
              
              <div className="flex flex-col md:flex-row md:items-start justify-between mb-4 gap-2">
                <div>
                  <h4 className="text-lg font-bold text-slate-800">{visit.diagnosis}</h4>
                  <div className="flex items-center text-sm text-slate-500 mt-1">
                    <UserIcon size={14} className="mr-1" /> {visit.doctor}
                  </div>
                </div>
                <div className="flex items-center text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full w-fit">
                  <Calendar size={14} className="mr-2" /> {visit.date}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                <div>
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center">
                    <Pill size={12} className="mr-1" /> Medicines
                  </h5>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{visit.medicines}</p>
                </div>
                {visit.notes && (
                  <div>
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center">
                      <FileText size={12} className="mr-1" /> Notes
                    </h5>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{visit.notes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- ADMIN DASHBOARD ---
function AdminDashboard({ patients }) {
  // Calculate analytics
  const stats = useMemo(() => {
    let totalVisits = 0;
    const doctorCounts = {};

    patients.forEach(p => {
      const history = p.history || [];
      totalVisits += history.length;
      history.forEach(visit => {
        doctorCounts[visit.doctor] = (doctorCounts[visit.doctor] || 0) + 1;
      });
    });

    return {
      totalPatients: patients.length,
      totalVisits,
      doctorCounts
    };
  }, [patients]);

  // Flatten history for activity feed
  const allActivity = useMemo(() => {
    const activity = [];
    patients.forEach(p => {
      const history = p.history || [];
      history.forEach(v => {
        activity.push({ ...v, patientName: p.name, patientId: p.id });
      });
    });
    // Sort by date descending
    return activity.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [patients]);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2 mb-6">
        <Shield className="text-blue-600 h-8 w-8" />
        <h1 className="text-2xl font-bold text-slate-800">Administrative Overview</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Registered Patients</p>
            <p className="text-2xl font-bold text-slate-800">{stats.totalPatients}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="bg-emerald-100 p-3 rounded-lg text-emerald-600">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Consultations</p>
            <p className="text-2xl font-bold text-slate-800">{stats.totalVisits}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doctor Performance */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Consultations by Doctor</h3>
          <div className="space-y-4">
            {Object.entries(stats.doctorCounts).map(([doctor, count]) => (
              <div key={doctor} className="flex justify-between items-center">
                <span className="text-sm text-slate-600 flex items-center">
                  <UserIcon size={14} className="mr-2 text-slate-400" /> {doctor}
                </span>
                <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded text-sm">{count} patients</span>
              </div>
            ))}
            {Object.keys(stats.doctorCounts).length === 0 && (
              <p className="text-sm text-slate-400">No consultations recorded yet.</p>
            )}
          </div>
        </div>

        {/* Recent Global Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Recent Hospital Activity</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Date</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3 rounded-r-lg">Diagnosis</th>
                </tr>
              </thead>
              <tbody>
                {allActivity.slice(0, 5).map((log, index) => (
                  <tr key={index} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{log.patientName} <span className="text-xs font-normal text-slate-400 ml-1">({log.patientId})</span></td>
                    <td className="px-4 py-3 text-slate-600">{log.doctor}</td>
                    <td className="px-4 py-3 text-slate-600">{log.diagnosis}</td>
                  </tr>
                ))}
                {allActivity.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-slate-400">No recent activity</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- GLOBALS STYLES ---
// Using Tailwind standard classes mostly, injecting custom button classes for reuse
const style = document.createElement('style');
style.innerHTML = `
  .btn-primary {
    background-color: #2563eb;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-weight: 500;
    transition: background-color 0.2s;
  }
  .btn-primary:hover {
    background-color: #1d4ed8;
  }
  .btn-secondary {
    background-color: #f1f5f9;
    color: #334155;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-weight: 500;
    border: 1px solid #e2e8f0;
    transition: all 0.2s;
  }
  .btn-secondary:hover {
    background-color: #e2e8f0;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fadeIn 0.3s ease-out forwards;
  }
`;
document.head.appendChild(style);
