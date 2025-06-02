import React, { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

interface AudioRecorderProps {
  onAudioReady: (audioUrl: string | null) => void;
  folder?: string;
}

const AudioRecorder = forwardRef<any, AudioRecorderProps>(({ onAudioReady, folder = 'media' }, ref) => {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const intervalId = useRef<NodeJS.Timeout | null>(null);

  // 1. Animación visual del botón de grabación
  // 2. Indicador de duración ya implementado
  // 3. Feedback de subida ya implementado
  // 4. Accesibilidad: vibración al iniciar grabación
  const startRecording = async () => {
    setAudioUrl(null);
    setTimer(0);
    setProgress(0);
    setUploading(false);
    setPendingBlob(null);
    if (window.navigator.vibrate) window.navigator.vibrate([50, 30, 50]);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new window.MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunks.current = [];
    mediaRecorder.ondataavailable = (e) => {
      audioChunks.current.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
      setPendingBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      setShowCancelPrompt(true);
    };
    mediaRecorder.start();
    setRecording(true);
    intervalId.current = setInterval(() => setTimer(t => t + 1), 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      setRecording(false);
      if (intervalId.current) clearInterval(intervalId.current);
      mediaRecorderRef.current.stop();
    }
  };

  // Confirmar envío (sube el audio)
  const confirmSend = async () => {
    setShowCancelPrompt(false);
    if (!pendingBlob) return;
    setUploading(true);
    setProgress(0);
    try {
      const filePath = `${folder}/audio_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webm`;
      for (let i = 1; i <= 90; i += 10) {
        await new Promise(res => setTimeout(res, 60));
        setProgress(i);
      }
      const { error } = await supabase.storage.from('media').upload(filePath, pendingBlob);
      setProgress(100);
      setUploading(false);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(filePath);
      setAudioUrl(null);
      setPendingBlob(null);
      // Publicar el audio: notificar al padre (CreatePostForm) que el audio está listo
      onAudioReady(urlData.publicUrl);
      setShowCancelPrompt(false);
    } catch (err) {
      setUploading(false);
      setProgress(0);
      setAudioUrl(null);
      setPendingBlob(null);
      onAudioReady(null);
      setShowCancelPrompt(false);
      toast.error('Error al subir audio');
    }
  };

  // Cancelar nota (no sube el audio)
  const cancelAndDelete = () => {
    setShowCancelPrompt(false);
    setAudioUrl(null);
    setPendingBlob(null);
    setTimer(0);
    setProgress(0);
    setUploading(false);
    onAudioReady(null);
    if (intervalId.current) clearInterval(intervalId.current);
  };

  const cancelRecording = () => {
    setRecording(false);
    setAudioUrl(null);
    setTimer(0);
    setProgress(0);
    setUploading(false);
    onAudioReady(null);
    if (intervalId.current) clearInterval(intervalId.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // 5. Previsualización y opción de eliminar ya implementadas
  // 6. Soporte para pausar/reanudar (experimental)
  const pauseRecording = () => {
    if (mediaRecorderRef.current && recording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };
  const resumeRecording = () => {
    if (mediaRecorderRef.current && recording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  // Cerrar previsualización al hacer clic fuera
  const previewRef = useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!showCancelPrompt) return;
    function handleClickOutside(event: MouseEvent) {
      if (previewRef.current && !previewRef.current.contains(event.target as Node)) {
        setShowCancelPrompt(false);
        setAudioUrl(null);
        setPendingBlob(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCancelPrompt]);

  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording: () => recording,
    isUploading: () => uploading,
  }));

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        {recording && !showCancelPrompt && (
          <>
            <button type="button" onClick={stopRecording} className="btn btn-danger btn-sm animate-pulse">Detener</button>
            <button type="button" onClick={pauseRecording} disabled={isPaused} className="btn btn-warning btn-xs ml-2">Pausar</button>
            <button type="button" onClick={resumeRecording} disabled={!isPaused} className="btn btn-success btn-xs ml-2">Reanudar</button>
          </>
        )}
        {recording && !showCancelPrompt && (
          <span className="text-red-500 font-mono animate-pulse">{timer}s</span>
        )}
        {(audioUrl || recording || uploading) && !showCancelPrompt && (
          <button type="button" onClick={cancelRecording} className="btn btn-secondary btn-sm">Cancelar</button>
        )}
      </div>
      {showCancelPrompt && (
        <div ref={previewRef} className="flex flex-col items-center gap-3 animate-fade-in bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-primary-600 dark:text-primary-400 animate-bounce">¡Revisa tu nota de voz!</span>
            <span className="text-base text-gray-700 dark:text-gray-200">¿Quieres enviarla o descartarla?</span>
          </div>
          {/* Previsualización y reproducción */}
          <audio src={audioUrl || undefined} controls className="w-full my-2 rounded-lg shadow" />
          <div className="flex gap-4 mt-2">
            <button type="button" onClick={confirmSend} className="btn btn-success btn-lg flex items-center gap-2 animate-bounce">
              <svg xmlns='http://www.w3.org/2000/svg' className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' /></svg>
              Enviar
            </button>
            <button type="button" onClick={cancelAndDelete} className="btn btn-danger btn-lg flex items-center gap-2 animate-shake">
              <svg xmlns='http://www.w3.org/2000/svg' className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' /></svg>
              Descartar
            </button>
          </div>
          <button type="button" onClick={startRecording} className="btn btn-primary btn-xs mt-2 animate-fade-in">Regrabar</button>
        </div>
      )}
      {uploading && (
        <div className="w-full bg-gray-200 rounded h-2">
          <div
            className="bg-primary-500 h-2 rounded"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {audioUrl && !recording && !uploading && !showCancelPrompt && (
        <div
          className={`space-y-1 relative group ${dragOver ? 'ring-2 ring-red-500 bg-red-50' : ''}`}
          draggable
          onDragStart={e => {
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={() => {
            setDragOver(false);
            setAudioUrl(null);
            setPendingBlob(null);
            onAudioReady(null);
            toast('Nota de voz eliminada');
          }}
        >
          <audio src={audioUrl} controls className="w-full" />
          <div className="flex gap-2">
            <button type="button" onClick={startRecording} className="btn btn-primary btn-xs">Regrabar</button>
            <span className="text-xs text-gray-500 group-hover:text-red-600 transition">Arrastra a la izquierda para eliminar</span>
          </div>
          {dragOver && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-red-600 font-bold text-lg animate-bounce">Soltar para eliminar</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default AudioRecorder;
