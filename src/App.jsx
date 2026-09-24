import { useState, useEffect, useRef } from "react";
import "./App.css";
import Chatbot from "./Chatbot";

const DEFAULT_FOCUS = 25 * 60;
const DEFAULT_SHORT_BREAK = 5 * 60;
const DEFAULT_LONG_BREAK = 15 * 60;

// IndexedDB utility functions for My Music
const DB_NAME = "FocusFlowMusicDB";
const STORE_NAME = "music";

const openMusicDatabase = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const loadUserMusicFromDB = async () => {
  try {
    const db = await openMusicDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to load music from DB", err);
    return [];
  }
};

const saveUserMusicToDB = async (musicItem) => {
  try {
    const db = await openMusicDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(musicItem);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to save music to DB", err);
  }
};

const deleteUserMusicFromDB = async (id) => {
  try {
    const db = await openMusicDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to delete music from DB", err);
  }
};

function App() {
  // Navigation
  const [currentPage, setCurrentPage] = useState("dashboard");

  // Load and migrate state from localStorage safely
  const loadState = (key, fallbacks, defaultValue) => {
    let val = localStorage.getItem(key);
    if (!val) {
      for (const fallback of fallbacks) {
        val = localStorage.getItem(fallback);
        if (val) break;
      }
    }
    if (val) {
      try { return JSON.parse(val); } catch (e) { return defaultValue; }
    }
    return defaultValue;
  };

  const [tasks, setTasks] = useState([]);
  
  useEffect(() => {
    fetch('http://localhost:5000/api/tasks')
      .then(res => res.json())
      .then(data => setTasks(data))
      .catch(err => console.error('Error fetching tasks:', err));
  }, []);
  
  const [deletedTasks, setDeletedTasks] = useState(() => 
    loadState("focusflow_recently_deleted", ["recentlyDeleted", "pomodoro_recently_deleted"], [])
  );
  
  const [completedPomodoros, setCompletedPomodoros] = useState(() => 
    loadState("focusflow_completed_pomodoros", ["completedPomodoros", "pomodoro_completed"], 0)
  );
  
  const [ambientSound, setAmbientSound] = useState(() => 
    loadState("focusflow_ambient_sound", ["ambientSound", "pomodoro_sound"], "none")
  );
  
  const [ambientVolume, setAmbientVolume] = useState(() => 
    loadState("focusflow_ambient_volume", ["ambientVolume", "pomodoro_volume"], 50)
  );

  const [currentTaskId, setCurrentTaskId] = useState(null);

  // My Music State
  const [userMusic, setUserMusic] = useState([]);
  const [activeUserMusicId, setActiveUserMusicId] = useState(null);
  const [isUserMusicPlaying, setIsUserMusicPlaying] = useState(false);
  
  const userAudioRef = useRef(new Audio());
  const currentObjectUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadUserMusicFromDB().then(data => setUserMusic(data || []));
  }, []);

  // Sync to localStorage for non-task items
  useEffect(() => { localStorage.setItem("focusflow_recently_deleted", JSON.stringify(deletedTasks)); }, [deletedTasks]);
  useEffect(() => { localStorage.setItem("focusflow_completed_pomodoros", JSON.stringify(completedPomodoros)); }, [completedPomodoros]);
  useEffect(() => { localStorage.setItem("focusflow_ambient_sound", JSON.stringify(ambientSound)); }, [ambientSound]);
  useEffect(() => { localStorage.setItem("focusflow_ambient_volume", JSON.stringify(ambientVolume)); }, [ambientVolume]);

  // Timer State (Transient)
  const [timerMode, setTimerMode] = useState("focus"); // 'focus', 'shortBreak', 'longBreak'
  const [timeLeft, setTimeLeft] = useState(DEFAULT_FOCUS);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef(null);

  // Audio Engine
  const audioRef = useRef(new Audio());

  useEffect(() => {
    const audio = audioRef.current;
    audio.loop = true;
    audio.volume = ambientVolume / 100;
    if (userAudioRef.current) {
      userAudioRef.current.volume = ambientVolume / 100;
    }
  }, [ambientVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    const userAudio = userAudioRef.current;
    
    // Determine if audio should be playing
    const isFocus = isRunning && timerMode === "focus";
    const shouldPlayAmbient = isFocus && ambientSound !== "none" && !isUserMusicPlaying;
    const shouldPlayUser = isFocus && isUserMusicPlaying;
    
    if (shouldPlayAmbient) {
      const SOUND_URLS = {
        rain: "https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg",
        forest: "https://actions.google.com/sounds/v1/ambiences/forest_day_with_birds.ogg",
        coffee: "https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg",
        ocean: "https://actions.google.com/sounds/v1/water/ocean_waves.ogg",
        fireplace: "https://actions.google.com/sounds/v1/ambiences/fire.ogg",
        lofi: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3"
      };

      const url = SOUND_URLS[ambientSound];
      if (audio.src !== url) {
        audio.src = url;
      }
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } else {
      audio.pause();
    }

    if (shouldPlayUser) {
      const playPromise = userAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } else {
      userAudio.pause();
    }
  }, [isRunning, timerMode, ambientSound, isUserMusicPlaying]);

  // Timer Engine
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRunning, timerMode]);

  const handleTimerComplete = () => {
    setIsRunning(false);
    clearInterval(timerRef.current);
    
    if (timerMode === "focus") {
      const newCount = completedPomodoros + 1;
      setCompletedPomodoros(newCount);
      
      if (currentTaskId) {
        setTasks(prev => prev.map(t => 
          t.id === currentTaskId ? { ...t, pomodoros: (t.pomodoros || 0) + 1 } : t
        ));
      }
      
      setTimeout(() => {
        if (newCount % 4 === 0) {
          setTimerMode("longBreak");
          setTimeLeft(DEFAULT_LONG_BREAK);
          saveSession(DEFAULT_LONG_BREAK, "longBreak");
        } else {
          setTimerMode("shortBreak");
          setTimeLeft(DEFAULT_SHORT_BREAK);
          saveSession(DEFAULT_SHORT_BREAK, "shortBreak");
        }
      }, 0);
    } else {
      // Natural completion of break
      setTimeout(() => {
        setTimerMode("focus");
        setTimeLeft(DEFAULT_FOCUS);
      }, 0);
    }
  };

  const saveSession = (duration, sessionType) => {
    fetch('http://localhost:5000/api/pomodoro/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: currentTaskId,
        duration: duration,
        sessionType: sessionType
      })
    }).catch(err => console.error('Error saving session:', err));
  };

  // Timer Controls
  const toggleTimer = () => setIsRunning(!isRunning);
  
  const resetTimer = () => {
    setIsRunning(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    if (timerMode === "focus") setTimeLeft(DEFAULT_FOCUS);
    else if (timerMode === "shortBreak") setTimeLeft(DEFAULT_SHORT_BREAK);
    else if (timerMode === "longBreak") setTimeLeft(DEFAULT_LONG_BREAK);
  };

  const skipTimer = () => {
    setIsRunning(false);
    if (timerMode === "focus") {
      if ((completedPomodoros + 1) % 4 === 0) {
        setTimerMode("longBreak");
        setTimeLeft(DEFAULT_LONG_BREAK);
      } else {
        setTimerMode("shortBreak");
        setTimeLeft(DEFAULT_SHORT_BREAK);
      }
    } else {
      setTimerMode("focus");
      setTimeLeft(DEFAULT_FOCUS);
    }
  };

  const changeMode = (mode) => {
    setIsRunning(false);
    setTimerMode(mode);
    if (mode === "focus") setTimeLeft(DEFAULT_FOCUS);
    else if (mode === "shortBreak") setTimeLeft(DEFAULT_SHORT_BREAK);
    else if (mode === "longBreak") setTimeLeft(DEFAULT_LONG_BREAK);
  };

  // My Music Controls
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const newMusic = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      name: file.name,
      type: file.type,
      date: new Date().toISOString(),
      file: file
    };

    await saveUserMusicToDB(newMusic);
    setUserMusic(prev => [...prev, newMusic]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deleteUserMusic = async (id) => {
    await deleteUserMusicFromDB(id);
    setUserMusic(prev => prev.filter(m => m.id !== id));
    if (activeUserMusicId === id) {
      setIsUserMusicPlaying(false);
      setActiveUserMusicId(null);
      userAudioRef.current.pause();
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    }
  };

  const toggleUserMusic = (music) => {
    if (activeUserMusicId === music.id && isUserMusicPlaying) {
      setIsUserMusicPlaying(false);
      return;
    }
    
    if (activeUserMusicId !== music.id) {
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
      }
      currentObjectUrlRef.current = URL.createObjectURL(music.file);
      userAudioRef.current.src = currentObjectUrlRef.current;
      setActiveUserMusicId(music.id);
    }
    
    setIsUserMusicPlaying(true);
    setAmbientSound("none"); // Mutual exclusion
  };

  // Task Actions
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskReminder, setNewTaskReminder] = useState("");

  // Background Reminder Engine
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      let updated = false;

      setTasks(currentTasks => {
        const nextTasks = currentTasks.map(task => {
          if (!task.completed && task.reminderTime && !task.reminderTriggered) {
            const reminderTime = new Date(task.reminderTime);
            if (now >= reminderTime) {
              updated = true;
              if (Notification.permission === "granted") {
                new Notification("FocusFlow Reminder", {
                  body: `It's time to start: ${task.title}`
                });
              } else {
                alert(`FocusFlow Reminder: It's time to start "${task.title}"`);
              }
              return { ...task, reminderTriggered: true };
            }
          }
          return task;
        });
        return updated ? nextTasks : currentTasks;
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const addTask = (e) => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;

    if (newTaskReminder && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }

    const newTask = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      title,
      completed: false,
      createdAt: new Date().toISOString(),
      pomodoros: 0,
      reminderTime: newTaskReminder || null,
      reminderTriggered: false
    };

    fetch('http://localhost:5000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask)
    })
    .then(res => res.json())
    .then(data => {
      setTasks([data, ...tasks]);
      setNewTaskTitle("");
      setNewTaskReminder("");
    })
    .catch(err => console.error('Error adding task:', err));
  };

  const toggleTaskCompletion = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    fetch(`http://localhost:5000/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.completed })
    })
    .then(() => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    })
    .catch(err => console.error('Error toggling task:', err));
  };

  const deleteTask = (task) => {
    if (currentTaskId === task.id) setCurrentTaskId(null);
    
    fetch(`http://localhost:5000/api/tasks/${task.id}`, {
      method: 'DELETE'
    })
    .then(() => {
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setDeletedTasks(prev => [{ ...task, deletedAt: new Date().toISOString() }, ...prev]);
    })
    .catch(err => console.error('Error deleting task:', err));
  };

  const restoreTask = (task) => {
    const { deletedAt, ...rest } = task;
    setDeletedTasks(prev => prev.filter(t => t.id !== task.id));
    setTasks(prev => [rest, ...prev]);
  };

  const deletePermanently = (id) => {
    if (window.confirm("Delete this task permanently? This cannot be undone.")) {
      setDeletedTasks(prev => prev.filter(t => t.id !== id));
    }
  };

  const emptyTrash = () => {
    if (window.confirm("Empty all deleted tasks permanently?")) {
      setDeletedTasks([]);
    }
  };

  const focusTask = (id) => {
    setCurrentTaskId(id);
    setCurrentPage("dashboard");
    changeMode("focus");
  };

  // Format Time
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getProgress = () => {
    let total = DEFAULT_FOCUS;
    if (timerMode === "shortBreak") total = DEFAULT_SHORT_BREAK;
    else if (timerMode === "longBreak") total = DEFAULT_LONG_BREAK;
    return ((total - timeLeft) / total) * 100;
  };

  // Derived Stats
  const activeTasksCount = tasks.length;
  const completedTasksCount = tasks.filter(t => t.completed).length;
  const currentTask = tasks.find(t => t.id === currentTaskId);
  
  const [statsData, setStatsData] = useState({});

  useEffect(() => {
    if (currentPage === "stats") {
      fetch('http://localhost:5000/api/pomodoro/stats')
        .then(res => res.json())
        .then(data => setStatsData(data))
        .catch(err => console.error('Error fetching stats:', err));
    }
  }, [currentPage]);

  return (
    <div className="app-container">
      <nav className="sidebar">
        <div className="brand">🍅 FocusFlow</div>
        <ul className="nav-links">
          <li>
            <button className={currentPage === "dashboard" ? "active" : ""} onClick={() => setCurrentPage("dashboard")}>
              🏠 Dashboard
            </button>
          </li>
          <li>
            <button className={currentPage === "stats" ? "active" : ""} onClick={() => setCurrentPage("stats")}>
              📈 Statistics
            </button>
          </li>
          <li>
            <button className={currentPage === "tasks" ? "active" : ""} onClick={() => setCurrentPage("tasks")}>
              <span className="nav-label">📋 Today's Tasks</span>
              {activeTasksCount > 0 && <span className="badge">{activeTasksCount}</span>}
            </button>
          </li>
          <li>
            <button className={currentPage === "deleted" ? "active" : ""} onClick={() => setCurrentPage("deleted")}>
              <span className="nav-label">🗑 Recently Deleted</span>
              {deletedTasks.length > 0 && <span className="badge">{deletedTasks.length}</span>}
            </button>
          </li>
        </ul>
      </nav>

      <main className="content">
        {currentPage === "dashboard" && (
          <div className="dashboard">
            <div className="timer-card card">
              <div className="timer-modes">
                <button className={timerMode === "focus" ? "active" : ""} onClick={() => changeMode("focus")}>Focus</button>
                <button className={timerMode === "shortBreak" ? "active" : ""} onClick={() => changeMode("shortBreak")}>Short Break</button>
                <button className={timerMode === "longBreak" ? "active" : ""} onClick={() => changeMode("longBreak")}>Long Break</button>
              </div>

              <div className="timer-display-wrapper">
                <div 
                  className="progress-ring" 
                  style={{ background: `conic-gradient(var(--accent) ${getProgress()}%, var(--ring-bg) 0)` }}
                >
                  <div className="timer-display">{formatTime(timeLeft)}</div>
                </div>
              </div>

              <div className="current-task-display">
                Current Task: {currentTask ? <strong>{currentTask.title}</strong> : <span className="muted">No task selected</span>}
              </div>

              <div className="timer-controls">
                <button className="primary-btn" onClick={toggleTimer}>{isRunning ? "Pause" : "Start"}</button>
                <button className="secondary-btn" onClick={resetTimer}>Reset</button>
                <button className="secondary-btn" onClick={skipTimer}>Skip</button>
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="card ambient-card">
                <h3>Ambient Sounds</h3>
                <div className="sound-options">
                  {["none", "rain", "forest", "coffee", "ocean", "fireplace", "lofi"].map(sound => (
                    <label key={sound} className={`sound-label ${ambientSound === sound ? "active" : ""}`}>
                      <input 
                        type="radio" 
                        name="ambient" 
                        value={sound} 
                        checked={ambientSound === sound} 
                        onChange={(e) => setAmbientSound(e.target.value)} 
                      />
                      {sound.charAt(0).toUpperCase() + sound.slice(1)}
                    </label>
                  ))}
                </div>
                <div className="volume-control">
                  <label>Volume {ambientVolume}%</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={ambientVolume} 
                    onChange={(e) => setAmbientVolume(parseInt(e.target.value))} 
                  />
                </div>
              </div>

              <div className="card my-music-card">
                <h3>My Music</h3>
                <div className="music-upload">
                  <input 
                    type="file" 
                    accept="audio/*" 
                    onChange={handleFileUpload} 
                    ref={fileInputRef}
                    style={{display: 'none'}}
                    id="musicUpload"
                  />
                  <label htmlFor="musicUpload" className="secondary-btn upload-btn">
                    ➕ Add Your Music
                  </label>
                </div>
                {userMusic.length > 0 && (
                  <div className="user-music-list">
                    {userMusic.map(music => (
                      <div key={music.id} className={`user-music-item ${activeUserMusicId === music.id ? "active" : ""}`}>
                        <span className="music-name" title={music.name}>{music.name}</span>
                        <div className="music-actions">
                          <button 
                            className="play-music-btn" 
                            onClick={() => toggleUserMusic(music)}
                          >
                            {activeUserMusicId === music.id && isUserMusicPlaying ? "Pause" : "Play"}
                          </button>
                          <button className="delete-btn" onClick={() => deleteUserMusic(music.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {currentPage === "stats" && (
          <div className="stats-page">
            <div className="page-header">
              <h2>Statistics</h2>
            </div>
            
            {(!statsData || (!statsData.todayPomodoros && !statsData.todayFocusTime)) ? (
              <div className="empty-state">
                <p>No statistics for today yet.</p>
                <span>Complete a task or focus session to see your daily stats!</span>
                <button className="primary-btn" onClick={() => setCurrentPage("dashboard")} style={{marginTop: '15px'}}>
                  Go to Dashboard
                </button>
              </div>
            ) : (
              <div className="card stats-card">
                <div className="task-list">
                  <div className="task-item card deleted-item" style={{padding: '12px 16px'}}>
                    <div className="task-main">
                      <span className="task-title">Today's Focus Time</span>
                      <span className="deleted-date">Total time focused today</span>
                    </div>
                    <div className="task-meta">
                      <span style={{fontSize: '20px', fontWeight: '600'}}>⏱ {formatTime(statsData.todayFocusTime || 0)}</span>
                    </div>
                  </div>
                  <div className="task-item card deleted-item" style={{padding: '12px 16px'}}>
                    <div className="task-main">
                      <span className="task-title">Completed Pomodoros</span>
                      <span className="deleted-date">Today's focus sessions</span>
                    </div>
                    <div className="task-meta">
                      <span style={{fontSize: '20px', fontWeight: '600'}}>🍅 {statsData.todayPomodoros || 0}</span>
                    </div>
                  </div>
                  <div className="task-item card deleted-item" style={{padding: '12px 16px'}}>
                    <div className="task-main">
                      <span className="task-title">Active Tasks</span>
                      <span className="deleted-date">Tasks remaining</span>
                    </div>
                    <div className="task-meta">
                      <span style={{fontSize: '20px', fontWeight: '600'}}>📋 {statsData.activeTasks || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentPage === "tasks" && (
          <div className="tasks-page">
            <h2>Today's Tasks</h2>
            
            <form className="add-task-form card" onSubmit={addTask}>
              <div className="add-task-inputs" style={{display: 'flex', gap: '10px', width: '100%'}}>
                <input 
                  type="text" 
                  placeholder="What are you working on?" 
                  value={newTaskTitle} 
                  onChange={(e) => setNewTaskTitle(e.target.value)} 
                  autoFocus
                  style={{flex: 1}}
                />
                <input 
                  type="datetime-local" 
                  value={newTaskReminder} 
                  onChange={(e) => setNewTaskReminder(e.target.value)}
                  style={{padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)', outline: 'none'}}
                  title="Set Reminder (Optional)"
                />
              </div>
              <button type="submit" className="primary-btn">Add Task</button>
            </form>

            <div className="task-list">
              {tasks.length === 0 ? (
                <div className="empty-state">
                  <p>No tasks yet</p>
                  <span>Add your first task to start focusing.</span>
                </div>
              ) : (
                tasks.map(task => (
                  <div className={`task-item card ${task.completed ? "completed" : ""}`} key={task.id}>
                    <div className="task-main">
                      <input 
                        type="checkbox" 
                        checked={task.completed} 
                        onChange={() => toggleTaskCompletion(task.id)} 
                      />
                      <div className="task-title-group" style={{display: 'flex', flexDirection: 'column'}}>
                        <span className="task-title">{task.title}</span>
                        {task.reminderTime && (
                          <span className="task-reminder" style={{fontSize: '12px', color: task.reminderTriggered ? 'var(--text-muted)' : 'var(--primary)', marginTop: '4px'}}>
                            🔔 {new Date(task.reminderTime).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="task-meta">
                      <span className="task-pomodoros">🍅 {task.pomodoros || 0} sessions</span>
                      {!task.completed && (
                        <button className="focus-btn" onClick={() => focusTask(task.id)}>Focus</button>
                      )}
                      <button className="delete-btn" onClick={() => deleteTask(task)}>Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {currentPage === "deleted" && (
          <div className="deleted-page">
            <div className="page-header">
              <h2>Recently Deleted</h2>
              {deletedTasks.length > 0 && (
                <button className="secondary-btn danger" onClick={emptyTrash}>Empty Trash</button>
              )}
            </div>
            
            <div className="task-list">
              {deletedTasks.length === 0 ? (
                <div className="empty-state">
                  <p>Recently Deleted is empty</p>
                  <span>Deleted tasks will appear here.</span>
                  <button className="secondary-btn" onClick={() => setCurrentPage("tasks")} style={{marginTop: 10}}>Back to Today's Tasks</button>
                </div>
              ) : (
                deletedTasks.map(task => (
                  <div className="task-item card deleted-item" key={task.id}>
                    <div className="task-main">
                      <span className="task-title">{task.title}</span>
                      <span className="deleted-date">
                        Deleted {new Date(task.deletedAt).toLocaleDateString()} at {new Date(task.deletedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <div className="task-meta">
                      <button className="restore-btn" onClick={() => restoreTask(task)}>Restore</button>
                      <button className="delete-perm-btn" onClick={() => deletePermanently(task.id)}>Delete Permanently</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
      <Chatbot />
    </div>
  );
}

export default App;