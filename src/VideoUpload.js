import { useState, useRef } from 'react';
import './VideoUpload.css';
import ClipTrimmer from './ClipTrimmer';

function VideoUpload() {
  const [videoSrc, setVideoSrc] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [duration, setDuration] = useState(0);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('video/')) return;
    const url = URL.createObjectURL(file);
    setVideoSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setFileName(file.name);
    setDuration(0);
  };

  const handleInputChange = (e) => handleFile(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="video-upload">
      <h1 className="video-upload__title">Tennis Video Editor</h1>

      {!videoSrc && (
        <div
          className={`video-upload__dropzone${isDragging ? ' video-upload__dropzone--active' : ''}`}
          onClick={() => fileInputRef.current.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
        >
          <div className="video-upload__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="video-upload__prompt">Drop a video here or <span>browse</span></p>
          <p className="video-upload__hint">MP4, MOV, AVI, WebM and more</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleInputChange}
            className="video-upload__input"
          />
        </div>
      )}

      {videoSrc && (
        <div className="video-upload__player">
          <div className="video-upload__file-info">
            <span className="video-upload__file-name">{fileName}</span>
            <button
              className="video-upload__change-btn"
              onClick={() => fileInputRef.current.click()}
            >
              Change video
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleInputChange}
              className="video-upload__input"
            />
          </div>

          <video
            ref={videoRef}
            src={videoSrc}
            className="video-upload__video"
            onLoadedMetadata={() => setDuration(videoRef.current.duration)}
          />

          <ClipTrimmer key={videoSrc} videoRef={videoRef} duration={duration} />
        </div>
      )}
    </div>
  );
}

export default VideoUpload;
