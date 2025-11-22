import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, 
  Upload, Search, Menu, Bell, Home, Compass, Clock, ThumbsUp, 
  MessageSquare, Share2, User, X, CheckCircle, Film, MoreVertical,
  Loader2, Signal, AlertTriangle, FastForward, Rewind
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  increment, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';

// Import Storage functions
import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';

/* ===================================================================
  INITIALIZATION & CONFIGURATION 
  ===================================================================
*/

// YOUR KEYS
const firebaseConfig = {
  apiKey: "AIzaSyD0r1nDmW55Xchfp7nkCg7ckigXnmWBum0",
  authDomain: "streamsanto-b8d8a.firebaseapp.com",
  projectId: "streamsanto-b8d8a",
  storageBucket: "streamsanto-b8d8a.firebasestorage.app",
  messagingSenderId: "668297890550",
  appId: "1:668297890550:web:cb6e578a3f34b7e6f87ad7",
  measurementId: "G-VSQGQ3W8DV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const appId = 'streamflix-local';

// Seed data for the platform so it's not empty on first load
const SEED_VIDEOS = [
  {
    id: 'seed-1',
    title: "Cyberpunk City Ambience - 4K",
    thumbnail: "https://images.unsplash.com/photo-1605218427360-691be2c6d232?q=80&w=1000&auto=format&fit=crop",
    channel: "Neon Dreams",
    views: 1250430,
    uploadedAt: new Date(Date.now() - 86400000 * 2), // 2 days ago
    duration: "12:34",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Neon",
    description: "Experience the futuristic vibes of a neon-soaked metropolis. Best viewed in high definition.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" 
  },
  {
    id: 'seed-2',
    title: "Mountain Hiking Guide for Beginners",
    thumbnail: "https://images.unsplash.com/photo-1551632811-561732d1e306?q=80&w=1000&auto=format&fit=crop",
    channel: "Adventure Time",
    views: 85000,
    uploadedAt: new Date(Date.now() - 86400000 * 5),
    duration: "08:12",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Hiker",
    description: "Everything you need to know before your first hike.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  },
  {
    id: 'seed-3',
    title: "Abstract Fluid Art Process",
    thumbnail: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=1000&auto=format&fit=crop",
    channel: "Creative Minds",
    views: 432000,
    uploadedAt: new Date(Date.now() - 86400000 * 12),
    duration: "05:45",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Art",
    description: "Watch the satisfying process of acrylic pouring.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
  }
];

/* ===================================================================
  UTILITY FUNCTIONS 
  ===================================================================
*/

const formatTime = (timeInSeconds) => {
  if (isNaN(timeInSeconds)) return "00:00";
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const formatViews = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num;
};

const formatDate = (date) => {
  if (!date) return '';
  const now = new Date();
  const diff = now - (date.seconds ? date.toDate() : new Date(date));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

/* ===================================================================
  COMPONENTS
  ===================================================================
*/

// --- Custom Video Player with Quality Controls & Double Tap ---
const VideoPlayer = ({ src, poster, autoplay = false }) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [playing, setPlaying] = useState(autoplay);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [quality, setQuality] = useState('auto');
  const [showSettings, setShowSettings] = useState(false);
  const [seekAnimation, setSeekAnimation] = useState(null); // 'forward' or 'backward'

  const controlsTimeoutRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);
    
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    
    if (autoplay) video.play().catch(() => setPlaying(false));

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
    };
  }, [src, autoplay]);

  const togglePlay = (e) => {
    // Prevent toggle if clicking specifically on controls
    if (e.target.closest('button') || e.target.closest('input')) return;

    if (videoRef.current.paused) {
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const handleDoubleClick = (e) => {
    const rect = playerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    const seekTime = 10; // Seconds to skip

    if (x > width / 2) {
      // Forward
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + seekTime, videoRef.current.duration);
      setSeekAnimation('forward');
    } else {
      // Backward
      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - seekTime, 0);
      setSeekAnimation('backward');
    }

    // Clear animation after 500ms
    setTimeout(() => setSeekAnimation(null), 500);
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    videoRef.current.volume = newVol;
    setMuted(newVol === 0);
  };

  const toggleMute = () => {
    setMuted(!muted);
    videoRef.current.muted = !muted;
    if (muted) videoRef.current.volume = volume || 0.5;
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2500);
  };

  const handleQualityChange = (newQuality) => {
    setQuality(newQuality);
    setShowSettings(false);
    const currentTime = videoRef.current.currentTime;
    const wasPlaying = !videoRef.current.paused;
    
    videoRef.current.pause();
    setTimeout(() => {
      videoRef.current.currentTime = currentTime;
      if (wasPlaying) videoRef.current.play();
    }, 500);
  };

  return (
    <div 
      ref={playerRef}
      className="relative w-full bg-black group aspect-video rounded-xl overflow-hidden shadow-2xl select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={togglePlay}
      onDoubleClick={handleDoubleClick}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain pointer-events-none" // Let container handle clicks
        playsInline
      />

      {/* Seek Animation Overlay */}
      {seekAnimation && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className={`bg-black/60 rounded-full p-4 flex flex-col items-center animate-ping ${seekAnimation === 'forward' ? 'translate-x-12' : '-translate-x-12'}`}>
            {seekAnimation === 'forward' ? <FastForward size={32} className="text-white" /> : <Rewind size={32} className="text-white" />}
            <span className="text-white text-xs font-bold mt-1">10s</span>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div 
        onClick={(e) => e.stopPropagation()} // Prevent playing when clicking control bar
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        
        <div className="relative w-full h-1.5 bg-gray-600 rounded-full cursor-pointer mb-4 group/slider">
          <div 
            className="absolute top-0 left-0 h-full bg-red-600 rounded-full"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          <input 
            type="range" 
            min="0" 
            max={duration || 0} 
            value={currentTime} 
            onChange={handleSeek}
            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <button onClick={(e) => { e.stopPropagation(); togglePlay(e); }} className="hover:text-red-500 transition">
              {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>
            
            <div className="flex items-center gap-2 group/vol">
              <button onClick={toggleMute}>
                {muted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1" 
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 group-hover/vol:w-20 transition-all duration-300 h-1 bg-white rounded-full accent-red-600"
              />
            </div>

            <span className="text-sm font-medium">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-1 hover:bg-white/20 px-2 py-1 rounded-md transition ${quality !== 'auto' ? 'text-red-400' : ''}`}
              >
                <Settings size={20} />
                <span className="text-xs font-bold uppercase">{quality === 'auto' ? 'Auto' : quality}</span>
              </button>

              {showSettings && (
                <div className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur-sm rounded-lg p-2 min-w-[150px] shadow-xl border border-gray-700">
                  <div className="text-xs font-semibold text-gray-400 mb-2 px-2">Quality</div>
                  {['1080p Premium', '720p HD', '480p SD', 'auto'].map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQualityChange(q === 'auto' ? 'auto' : q.split(' ')[0])}
                      className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between hover:bg-gray-700 ${quality === (q === 'auto' ? 'auto' : q.split(' ')[0]) ? 'text-red-500 bg-gray-800' : 'text-white'}`}
                    >
                      <span>{q === 'auto' ? 'Auto (Recommended)' : q}</span>
                      {quality === (q === 'auto' ? 'auto' : q.split(' ')[0]) && <CheckCircle size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={toggleFullscreen}>
              <Maximize size={24} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Sidebar Component ---
const Sidebar = ({ isOpen, activeTab, onTabChange }) => {
  const items = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'trending', icon: Compass, label: 'Trending' },
    { id: 'subs', icon: User, label: 'Subscriptions' },
    { id: 'library', icon: Film, label: 'Library' },
  ];

  return (
    <aside className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white dark:bg-[#0f0f0f] transition-all duration-300 z-20 
      ${isOpen ? 'w-60 translate-x-0' : 'w-0 -translate-x-full md:w-20 md:translate-x-0'} border-r border-gray-200 dark:border-gray-800`}>
      <div className="flex flex-col p-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex items-center gap-4 p-3 rounded-lg mb-1 transition-colors
              ${activeTab === item.id 
                ? 'bg-gray-100 dark:bg-gray-800 text-black dark:text-white font-medium' 
                : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
          >
            <item.icon size={24} />
            <span className={`${!isOpen && 'md:hidden'} whitespace-nowrap`}>{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
};

// --- Upload Modal Component ---
const UploadModal = ({ isOpen, onClose, user, onUploadComplete }) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(1); 
  const [progress, setProgress] = useState(0);
  const [metadata, setMetadata] = useState({ title: '', description: '' });
  const [uploading, setUploading] = useState(false);

  if (!isOpen) return null;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    if (file.type.startsWith('video/')) {
      setFile(file);
      setMetadata(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, "") }));
      setStep(2);
      setProgress(0);
    } else {
      alert("Please upload a video file.");
    }
  };

  // Real Upload Logic
  const handlePublish = async () => {
    if (!user || !file) return;
    
    setUploading(true);

    try {
      // 1. Create a reference to where the file will be saved
      // Path: videos/{userId}/{timestamp_filename}
      const storageRef = ref(storage, `videos/${user.uid}/${Date.now()}_${file.name}`);

      // 2. Start the upload
      const uploadTask = uploadBytesResumable(storageRef, file);

      // 3. Listen for progress
      uploadTask.on('state_changed', 
        (snapshot) => {
          // Calculate percentage
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(p);
        }, 
        (error) => {
          // Handle Error
          console.error("Upload failed:", error);
          alert("Upload failed! Check console.");
          setUploading(false);
        }, 
        async () => {
          // 4. Upload Complete - Get the public URL
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

          // 5. Save metadata to Firestore
          const newVideo = {
            title: metadata.title,
            description: metadata.description,
            views: 0,
            uploadedAt: serverTimestamp(),
            userId: user.uid,
            channel: user.displayName || 'Anonymous Creator',
            avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
            thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop', 
            videoUrl: downloadURL, // This is now a real cloud URL
            duration: "00:00" 
          };

          const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'videos'), newVideo);
          
          onUploadComplete({ ...newVideo, id: docRef.id });
          onClose();
          
          // Reset state
          setFile(null);
          setStep(1);
          setMetadata({ title: '', description: '' });
          setUploading(false);
          setProgress(0);
        }
      );

    } catch (error) {
      console.error("Error starting upload:", error);
      setUploading(false);
      alert("Failed to start upload.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#282828] w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Upload Video</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <div 
              className={`border-2 border-dashed rounded-xl h-80 flex flex-col items-center justify-center text-center cursor-pointer transition-colors
                ${dragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#1f1f1f]'}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('video-upload').click()}
            >
              <div className="bg-gray-100 dark:bg-[#1f1f1f] p-6 rounded-full mb-4">
                <Upload size={48} className="text-gray-400" />
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">Drag and drop video files to upload</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Your videos will be private until you publish them.</p>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-sm font-medium uppercase tracking-wide transition">
                Select Files
              </button>
              <input 
                id="video-upload" 
                type="file" 
                className="hidden" 
                accept="video/*" 
                onChange={handleChange} 
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="bg-gray-900 rounded aspect-video w-32 flex items-center justify-center">
                  <Film className="text-gray-600" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500 dark:text-gray-400">{file.name}</span>
                    <span className="text-blue-500">{uploading ? `${Math.round(progress)}%` : 'Ready to Upload'}</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${uploading ? 'bg-blue-600' : 'bg-gray-400'}`} 
                      style={{ width: `${progress}%` }} 
                    />
                  </div>
                  {!uploading && progress === 0 && <p className="text-xs text-gray-500 mt-1">Click Publish to start upload</p>}
                  {progress === 100 && <p className="text-xs text-green-500 mt-1 flex items-center gap-1"><CheckCircle size={12} /> Upload Complete</p>}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title (required)</label>
                  <input 
                    type="text" 
                    value={metadata.title}
                    onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Add a title that describes your video"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea 
                    value={metadata.description}
                    onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    placeholder="Tell viewers about your video"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {step === 2 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button 
              onClick={() => { setStep(1); setFile(null); setUploading(false); }}
              disabled={uploading}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              disabled={uploading || !metadata.title}
              onClick={handlePublish}
              className={`px-6 py-2 bg-blue-600 text-white rounded font-medium uppercase tracking-wide transition flex items-center gap-2
                ${(uploading || !metadata.title) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
            >
              {uploading ? <Loader2 className="animate-spin" size={18} /> : null}
              {uploading ? `Uploading ${Math.round(progress)}%` : 'Publish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main Application Component ---
const App = () => {
  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState(SEED_VIDEOS);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [currentVideo, setCurrentVideo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  // Auth & Data Initialization
  useEffect(() => {
    // 1. Try to Login
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth failed - Make sure 'Anonymous' is enabled in Firebase Console > Auth > Sign-in method", err);
        setLoading(false); 
      }
    };
    initAuth();

    // 2. Listen for User State
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && !currentUser.displayName) {
        updateProfile(currentUser, {
          displayName: `User${Math.floor(Math.random() * 10000)}`,
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.uid}`
        });
      }
      // If user logs out or isn't found, stop loading
      if (!currentUser) setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // Fetch Videos from Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'videos'),
      orderBy('uploadedAt', 'desc')
    );

    const unsubscribeData = onSnapshot(q, 
      (snapshot) => {
        const fetchedVideos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setVideos([...fetchedVideos, ...SEED_VIDEOS]);
        setLoading(false);
      },
      (error) => {
        console.error("Data fetch error - Make sure Firestore is enabled in Test Mode", error);
        setLoading(false);
      }
    );

    return () => unsubscribeData();
  }, [user]);

  // Filtered videos
  const displayVideos = useMemo(() => {
    return videos.filter(v => 
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v.channel.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [videos, searchQuery]);

  const handleVideoClick = (video) => {
    setCurrentVideo(video);
    window.scrollTo(0,0);
    
    // Only increment views if it's a real video
    if (!video.id.startsWith('seed-') && video.id) {
       try {
         const ref = doc(db, 'artifacts', appId, 'public', 'data', 'videos', video.id);
         updateDoc(ref, { views: increment(1) });
       } catch (e) { console.log("Could not update views"); }
    }
  };

  const handleUploadComplete = (newVideo) => {
    // If successful, the onSnapshot listener will update the list automatically.
    // But we can add it locally for instant feedback if we want.
  };

  // --- Main Layout ---
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] text-gray-900 dark:text-white font-sans">
      
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-white/95 dark:bg-[#0f0f0f]/95 backdrop-blur flex items-center justify-between px-4 z-30 border-b border-transparent dark:border-transparent">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
            <Menu size={24} />
          </button>
          <div 
            onClick={() => { setCurrentVideo(null); setActiveTab('home'); }}
            className="flex items-center gap-1 cursor-pointer"
          >
            <div className="bg-red-600 text-white p-1 rounded-lg">
              <Play size={20} fill="white" />
            </div>
            <span className="text-xl font-bold tracking-tighter hidden md:block">StreamFlix</span>
          </div>
        </div>

        <div className="flex-1 max-w-2xl px-4 hidden sm:block">
          <div className="flex items-center">
            <div className="flex flex-1 items-center bg-gray-100 dark:bg-[#121212] border border-gray-300 dark:border-gray-700 rounded-l-full px-4 py-2 focus-within:border-blue-500 ml-8">
              <input 
                type="text"
                placeholder="Search"
                className="w-full bg-transparent outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && <X size={20} className="cursor-pointer text-gray-500" onClick={() => setSearchQuery('')} />}
            </div>
            <button className="bg-gray-100 dark:bg-[#222] border border-l-0 border-gray-300 dark:border-gray-700 px-5 py-2 rounded-r-full hover:bg-gray-200 dark:hover:bg-[#333] transition">
              <Search size={20} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button className="sm:hidden p-2"><Search size={24} /></button>
          <button 
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 px-3 py-2 rounded-full transition text-sm font-medium border border-gray-200 dark:border-gray-700"
          >
            <Upload size={20} />
            <span className="hidden md:block">Upload</span>
          </button>
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full relative">
            <Bell size={24} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full border-2 border-white dark:border-[#0f0f0f]"></span>
          </button>
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm cursor-pointer">
            {user?.displayName ? user.displayName[0].toUpperCase() : 'U'}
          </div>
        </div>
      </nav>

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} activeTab={activeTab} onTabChange={(id) => { setActiveTab(id); setCurrentVideo(null); }} />

      {/* Content Area */}
      <main 
        className={`pt-16 transition-all duration-300 min-h-screen
        ${sidebarOpen ? 'md:pl-60' : 'md:pl-20'}`}
      >
        
        {/* Video Watch Page */}
        {currentVideo ? (
          <div className="flex flex-col lg:flex-row gap-6 p-4 lg:p-6 max-w-[1800px] mx-auto">
            <div className="flex-1">
              {/* Primary Player */}
              <VideoPlayer src={currentVideo.videoUrl} poster={currentVideo.thumbnail} autoplay={true} />
              
              <div className="mt-4">
                <h1 className="text-xl md:text-2xl font-bold line-clamp-2 mb-2">{currentVideo.title}</h1>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <img src={currentVideo.avatar} alt="" className="w-10 h-10 rounded-full bg-gray-700" />
                    <div>
                      <h3 className="font-bold text-base">{currentVideo.channel}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">1.2M subscribers</p>
                    </div>
                    <button className="ml-4 bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-full text-sm font-medium hover:opacity-90">
                      Subscribe
                    </button>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                    <div className="flex items-center bg-gray-100 dark:bg-[#222] rounded-full overflow-hidden">
                      <button className="flex items-center gap-2 px-4 py-2 hover:bg-gray-200 dark:hover:bg-[#333] border-r border-gray-300 dark:border-gray-600">
                        <ThumbsUp size={20} />
                        <span className="text-sm font-bold">12K</span>
                      </button>
                      <button className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-[#333]">
                        <div className="rotate-180"><ThumbsUp size={20} /></div>
                      </button>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-[#222] rounded-full hover:bg-gray-200 dark:hover:bg-[#333]">
                      <Share2 size={20} />
                      <span className="text-sm font-medium">Share</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 bg-gray-100 dark:bg-[#222] p-4 rounded-xl cursor-pointer hover:bg-gray-200 dark:hover:bg-[#333] transition">
                  <div className="flex items-center gap-2 text-sm font-bold mb-2">
                    <span>{formatViews(currentVideo.views)} views</span>
                    <span>•</span>
                    <span>{formatDate(currentVideo.uploadedAt)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-300">
                    {currentVideo.description || "No description provided."}
                  </p>
                </div>

                {/* Comments Section Mock */}
                <div className="mt-6">
                  <h3 className="font-bold text-lg mb-4">Comments</h3>
                  <div className="flex gap-4 mb-6">
                    <div className="w-10 h-10 bg-purple-600 rounded-full flex-shrink-0 flex items-center justify-center text-white">{user?.displayName?.[0] || 'U'}</div>
                    <div className="flex-1">
                      <input className="w-full bg-transparent border-b border-gray-300 dark:border-gray-700 focus:border-black dark:focus:border-white outline-none pb-1" placeholder="Add a comment..." />
                      <div className="flex justify-end mt-2">
                        <button className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-full text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 disabled:opacity-50" disabled>Comment</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recommended Videos Sidebar */}
            <div className="lg:w-[350px] xl:w-[400px] flex flex-col gap-3">
              {videos.filter(v => v.id !== currentVideo.id).map(video => (
                <div 
                  key={video.id} 
                  onClick={() => handleVideoClick(video)}
                  className="flex gap-2 cursor-pointer group"
                >
                  <div className="relative w-40 aspect-video rounded-lg overflow-hidden flex-shrink-0">
                    <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded font-medium">{video.duration}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm line-clamp-2 leading-snug mb-1 group-hover:text-blue-400 transition">{video.title}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{video.channel}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatViews(video.views)} views • {formatDate(video.uploadedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Home Feed Grid */
          <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-y-8 gap-x-4">
            {loading ? (
               // Skeleton Loader
               [1,2,3,4,5,6,7,8].map(i => (
                 <div key={i} className="animate-pulse">
                   <div className="bg-gray-200 dark:bg-gray-800 aspect-video rounded-xl mb-3"></div>
                   <div className="flex gap-3">
                     <div className="w-9 h-9 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                     <div className="flex-1">
                       <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2"></div>
                       <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2"></div>
                     </div>
                   </div>
                 </div>
               ))
            ) : (
              displayVideos.map((video) => (
                <div 
                  key={video.id} 
                  className="cursor-pointer group"
                  onClick={() => handleVideoClick(video)}
                >
                  <div className="relative aspect-video rounded-xl overflow-hidden mb-3">
                    <img 
                      src={video.thumbnail} 
                      alt={video.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                      {video.duration}
                    </div>
                  </div>
                  
                  <div className="flex gap-3 items-start px-1">
                    <img 
                      src={video.avatar} 
                      alt={video.channel} 
                      className="w-9 h-9 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base line-clamp-2 leading-snug mb-1 group-hover:text-blue-400 dark:group-hover:text-blue-400 transition-colors">
                        {video.title}
                      </h3>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <p className="hover:text-gray-900 dark:hover:text-white transition-colors">{video.channel}</p>
                        <p>{formatViews(video.views)} views • {formatDate(video.uploadedAt)}</p>
                      </div>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition">
                      <MoreVertical size={20} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal 
        isOpen={showUpload} 
        onClose={() => setShowUpload(false)} 
        user={user}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
};

export default App;