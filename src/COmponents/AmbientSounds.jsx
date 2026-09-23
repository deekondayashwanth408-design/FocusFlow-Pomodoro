import { useEffect, useRef, useState } from "react";

function AmbientSounds({ isPlaying }) {
  const [selectedSound, setSelectedSound] = useState("none");
  const [volume, setVolume] = useState(50);
  const [frequency, setFrequency] = useState(null);

  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const oscillatorsRef = useRef([]);
  const noiseSourceRef = useRef(null);
  const isStartedRef = useRef(false);

  const sounds = [
    { id: "piano", name: "🎹 Focus Piano" },
    { id: "lofi", name: "🎧 Lo-fi Study" },
    { id: "deep", name: "🧠 Deep Focus" },
    { id: "ambient", name: "🌌 Soft Ambient" },
    { id: "rain", name: "🌧️ Rain" },
    { id: "forest", name: "🌲 Forest" },
    { id: "coffee", name: "☕ Coffee Shop" },
    { id: "ocean", name: "🌊 Ocean" },
    { id: "fireplace", name: "🔥 Fireplace" },
  ];

  const stopSound = () => {
    oscillatorsRef.current.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {}
    });

    oscillatorsRef.current = [];

    if (noiseSourceRef.current) {
      try {
        noiseSourceRef.current.stop();
      } catch {}

      noiseSourceRef.current = null;
    }
  };

  const createAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContext =
        window.AudioContext || window.webkitAudioContext;

      audioContextRef.current = new AudioContext();

      masterGainRef.current =
        audioContextRef.current.createGain();

      masterGainRef.current.connect(
        audioContextRef.current.destination
      );
    }

    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  };

  const createTone = (frequencyValue, type = "sine") => {
    const context = audioContextRef.current;

    const oscillator = context.createOscillator();

    oscillator.type = type;
    oscillator.frequency.value = frequencyValue;

    oscillator.connect(masterGainRef.current);

    oscillator.start();

    oscillatorsRef.current.push(oscillator);
  };

  const createNoise = () => {
    const context = audioContextRef.current;

    const bufferSize = context.sampleRate * 2;

    const buffer = context.createBuffer(
      1,
      bufferSize,
      context.sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = context.createBufferSource();

    noise.buffer = buffer;
    noise.loop = true;

    const filter = context.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.value = 1200;

    noise.connect(filter);
    filter.connect(masterGainRef.current);

    noise.start();

    noiseSourceRef.current = noise;
  };

  const playSound = (sound) => {
    stopSound();

    if (sound === "none") {
      return;
    }

    createAudioContext();

    if (sound === "piano") {
      createTone(261.63, "sine");
      createTone(329.63, "sine");
      createTone(392.0, "sine");
    }

    if (sound === "lofi") {
      createTone(130.81, "sine");
      createTone(196.0, "triangle");
    }

    if (sound === "deep") {
      createTone(110, "sine");
      createTone(146.83, "sine");
    }

    if (sound === "ambient") {
      createTone(174.61, "sine");
      createTone(220, "sine");
      createTone(261.63, "sine");
    }

    if (sound === "rain") {
      createNoise();
    }

    if (sound === "forest") {
      createNoise();
      createTone(900, "sine");
    }

    if (sound === "coffee") {
      createNoise();
    }

    if (sound === "ocean") {
      createNoise();
      createTone(70, "sine");
    }

    if (sound === "fireplace") {
      createNoise();
      createTone(55, "sine");
    }
  };

  const handleSoundClick = (sound) => {
    setSelectedSound(sound);

    if (isPlaying) {
      playSound(sound);
    }
  };

  const handleFrequency = (value) => {
    setFrequency(value);

    if (isPlaying) {
      createAudioContext();

      createTone(value, "sine");
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      stopSound();
      return;
    }

    if (selectedSound !== "none") {
      playSound(selectedSound);
    }

    return () => {
      stopSound();
    };
  }, [isPlaying]);

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = volume / 100;
    }
  }, [volume]);

  return (
    <div className="card sounds-card">

      <div className="card-title">
        <span>🎧 Study Music</span>

        <span className="sound-status">
          {selectedSound === "none"
            ? "Off"
            : isPlaying
            ? "Playing"
            : "Ready"}
        </span>
      </div>

      <p className="sound-description">
        Choose a background sound for your focus session.
      </p>

      <h4 className="sound-heading">
        🎵 Music
      </h4>

      <div className="sound-options">

        {sounds.slice(0, 4).map((sound) => (
          <button
            key={sound.id}
            className={
              selectedSound === sound.id
                ? "sound-button active"
                : "sound-button"
            }
            onClick={() =>
              handleSoundClick(sound.id)
            }
          >
            {sound.name}
          </button>
        ))}

      </div>

      <h4 className="sound-heading">
        🌿 Ambient
      </h4>

      <div className="sound-options">

        {sounds.slice(4).map((sound) => (
          <button
            key={sound.id}
            className={
              selectedSound === sound.id
                ? "sound-button active"
                : "sound-button"
            }
            onClick={() =>
              handleSoundClick(sound.id)
            }
          >
            {sound.name}
          </button>
        ))}

      </div>

      <button
        className={
          selectedSound === "none"
            ? "sound-button none-sound active"
            : "sound-button none-sound"
        }
        onClick={() => handleSoundClick("none")}
      >
        🔇 No Sound
      </button>

      <div className="volume">

        <div className="volume-header">
          <span>🔊 Volume</span>
          <strong>{volume}%</strong>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(event) =>
            setVolume(Number(event.target.value))
          }
        />

      </div>

      <div className="frequency-section">

        <div className="frequency-title">
          〰️ Low Frequency
        </div>

        <div className="frequency-options">

          {[14, 20, 30, 40].map((value) => (
            <button
              key={value}
              className={
                frequency === value
                  ? "frequency-active"
                  : ""
              }
              onClick={() =>
                handleFrequency(value)
              }
            >
              {value} Hz
            </button>
          ))}

        </div>

      </div>

      {!isPlaying && selectedSound !== "none" && (
        <p className="sound-note">
          ▶ Start your focus timer to play the selected sound.
        </p>
      )}

    </div>
  );
}

export default AmbientSounds;