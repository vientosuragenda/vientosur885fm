import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import AudioRecorder from '../components/ui/AudioRecorder';
import VideoRecorder from '../components/ui/VideoRecorder';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { Mic, Camera, Smile, Clipboard, Trash2, Reply } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  file_url?: string;
  audio_url?: string;
  video_url?: string;
  sticker_url?: string;
  read?: boolean;
  reply_to?: {
    id: string;
    content: string;
  } | null;
}

interface Conversation {
  user_id: string;
  username: string;
  avatar_url: string;
  last_message: string;
  last_time: string;
  unread_count: number;
}

export default function MessagesPage() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const receiverId = searchParams.get('to');
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sticker, setSticker] = useState<string | null>(null);
  const [reactionMenuMsgId, setReactionMenuMsgId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<{ [msgId: string]: string }>({});
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Cargar conversaciones recientes
  useEffect(() => {
    if (!user) return;
    setConvLoading(true);
    const fetchConversations = async () => {
      const { data: allMsgs } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
      if (!allMsgs) {
        setConversations([]);
        setConvLoading(false);
        return;
      }
      const userMap: { [key: string]: Conversation } = {};
      for (const msg of allMsgs) {
        const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (!userMap[otherId]) {
          const { data: userData } = await supabase.from('usuarios').select('nombre_usuario,avatar_url').eq('id', otherId).single();
          userMap[otherId] = {
            user_id: otherId,
            username: userData?.nombre_usuario || 'Usuario',
            avatar_url: userData?.avatar_url || '/default-avatar.png',
            last_message: msg.content,
            last_time: msg.created_at,
            unread_count: 0,
          };
        }
        if (new Date(msg.created_at) > new Date(userMap[otherId].last_time)) {
          userMap[otherId].last_message = msg.content;
          userMap[otherId].last_time = msg.created_at;
        }
        if (msg.receiver_id === user.id && !msg.read) {
          userMap[otherId].unread_count += 1;
        }
      }
      const convArr = Object.values(userMap).sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime());
      setConversations(convArr);
      setConvLoading(false);
    };
    fetchConversations();
  }, [user, messages]);

  // Cargar mensajes entre el usuario actual y el receptor
  useEffect(() => {
    if (!user || !receiverId) return;
    setLoading(true);
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      setMessages(data || []);
      setLoading(false);
      await supabase.from('messages')
        .update({ read: true })
        .eq('receiver_id', user.id)
        .eq('sender_id', receiverId)
        .eq('read', false);
    };
    fetchMessages();
  }, [user, receiverId]);

  // Enviar mensaje mejorado
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !receiverId || (!newMessage.trim() && !selectedFile && !audioUrl && !videoUrl && !sticker)) return;
    let content = newMessage.trim();
    let file_url = null;
    let audio_url = null;
    let video_url = null;
    let sticker_url = null;
    // Subir archivo si existe
    if (selectedFile) {
      const { data, error } = await supabase.storage.from('chat-files').upload(`messages/${Date.now()}_${selectedFile.name}`, selectedFile);
      if (!error && data) file_url = data.path;
    }
    if (audioUrl) {
      audio_url = audioUrl;
    }
    if (videoUrl) {
      video_url = videoUrl;
    }
    if (sticker) {
      sticker_url = sticker;
    }
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: receiverId,
      content,
      file_url,
      audio_url,
      video_url,
      sticker_url,
      read: false,
      reply_to: replyTo ? { id: replyTo.id, content: replyTo.content } : null,
    });
    setNewMessage('');
    setSelectedFile(null);
    setAudioUrl(null);
    setVideoUrl(null);
    setSticker(null);
    setReplyTo(null);
    // Recargar mensajes
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  // Handler para agregar reacción a un mensaje
  const handleAddReaction = (msgId: string, emoji: string) => {
    setReactions(prev => ({ ...prev, [msgId]: emoji }));
    setReactionMenuMsgId(null);
    // Aquí podrías guardar la reacción en la base de datos si lo deseas
  };

  // Scroll automático al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Agrupar mensajes por día y usuario consecutivo
  function groupMessages(msgs: Message[]) {
    const groups: any[] = [];
    let lastDate = '';
    let lastSender = '';
    let currentGroup: any = null;
    msgs.forEach((msg) => {
      const date = new Date(msg.created_at).toLocaleDateString();
      if (date !== lastDate || msg.sender_id !== lastSender) {
        currentGroup = { date, sender_id: msg.sender_id, messages: [msg] };
        groups.push(currentGroup);
        lastDate = date;
        lastSender = msg.sender_id;
      } else {
        currentGroup.messages.push(msg);
      }
    });
    return groups;
  }

  // Acción copiar
  const handleCopy = (msg: Message) => {
    if (!msg.content) return;
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId(null), 1200);
    });
  };
  // Acción eliminar
  const handleDelete = async (msg: Message) => {
    if (!user || msg.sender_id !== user.id) return;
    await supabase.from('messages').delete().eq('id', msg.id);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  };
  // Acción responder
  const handleReply = (msg: Message) => {
    setReplyTo(msg);
  };

  if (!user) {
    return <div className="p-4">Inicia sesión para ver tus mensajes.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 flex gap-8">
      {/* Lista de conversaciones */}
      <div className="w-1/3 border-r pr-4">
        <h3 className="font-bold mb-4">Conversaciones</h3>
        {convLoading ? <div>Cargando...</div> : (
          <ul className="space-y-2">
            {conversations.map(conv => (
              <li key={conv.user_id}>
                <Link
                  to={`?to=${conv.user_id}`}
                  className={`flex items-center gap-3 p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-gray-800 ${receiverId === conv.user_id ? 'bg-primary-100 dark:bg-gray-900' : ''}`}
                >
                  <img src={conv.avatar_url} alt={conv.username} className="w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">@{conv.username}</span>
                      {conv.unread_count > 0 && (
                        <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 ml-2">{conv.unread_count}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-[180px]">{conv.last_message}</div>
                  </div>
                </Link>
              </li>
            ))}
            {conversations.length === 0 && <li className="text-gray-400">No hay conversaciones.</li>}
          </ul>
        )}
      </div>
      {/* Chat actual */}
      <div className="flex-1">
        {receiverId ? (
          <>
            {/* Cabecera del chat */}
            <div className="flex items-center gap-3 mb-2 p-2 bg-white dark:bg-gray-900 rounded-t-lg shadow-sm sticky top-0 z-10">
              {/* Avatar y nombre del receptor */}
              {conversations.find(c => c.user_id === receiverId) && (
                <>
                  <img src={conversations.find(c => c.user_id === receiverId)?.avatar_url || '/default-avatar.png'} alt="avatar" className="h-10 w-10 rounded-full" />
                  <div>
                    <div className="font-semibold">@{conversations.find(c => c.user_id === receiverId)?.username}</div>
                    <div className="text-xs text-gray-400">En línea</div>
                  </div>
                </>
              )}
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-b-lg p-4 h-[70vh] overflow-y-auto mb-4 flex flex-col gap-2">
              {loading ? (
                <div>Cargando...</div>
              ) : (
                groupMessages(messages).map((group, i) => (
                  <div key={i} className="mb-2">
                    {/* Fecha separadora */}
                    {(i === 0 || group.date !== groupMessages(messages)[i-1]?.date) && (
                      <div className="text-center text-xs text-gray-400 my-2">{group.date}</div>
                    )}
                    <div className={`flex ${group.sender_id === user.id ? 'justify-end' : 'justify-start'} gap-2`}>
                      {/* Avatar solo en el primer mensaje del grupo recibido */}
                      {group.sender_id !== user.id && (
                        <img src={conversations.find(c => c.user_id === group.sender_id)?.avatar_url || '/default-avatar.png'} alt="avatar" className="h-8 w-8 rounded-full self-end" />
                      )}
                      <div className="flex flex-col gap-1">
                        {group.messages.map((msg: Message, idx: number) => {
                          const isOwn = user && msg.sender_id === user.id;
                          return (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.15 }}
                              className={`relative group max-w-xs md:max-w-md px-4 py-2 rounded-2xl shadow ${isOwn ? 'bg-primary-600 text-white self-end rounded-br-none' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'} ${idx === 0 ? '' : 'mt-0.5'}`}
                              onContextMenu={e => { e.preventDefault(); setReactionMenuMsgId(msg.id); }}
                              onClick={() => setReactionMenuMsgId(msg.id)}
                              tabIndex={0}
                              aria-label="Reaccionar al mensaje"
                            >
                              {/* Si es respuesta */}
                              {msg.reply_to && (
                                <div className="text-xs text-primary-400 mb-1 border-l-2 border-primary-300 pl-2 italic">Respondiendo a: {msg.reply_to.content?.slice(0, 40)}...</div>
                              )}
                              {msg.content && <span>{msg.content}</span>}
                              {msg.file_url && <a href={supabase.storage.from('chat-files').getPublicUrl(msg.file_url).publicURL} target="_blank" rel="noopener noreferrer" className="block text-blue-500">Archivo adjunto</a>}
                              {msg.audio_url && <audio controls src={msg.audio_url} className="mt-2" />}
                              {msg.video_url && <video controls src={msg.video_url} className="mt-2 max-w-xs" />}
                              {msg.sticker_url && <img src={msg.sticker_url} alt="sticker" className="h-12 mt-2" />}
                              {/* Acciones rápidas */}
                              <AnimatePresence>
                                {reactionMenuMsgId === msg.id && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute -top-16 right-0 bg-white dark:bg-gray-800 shadow-lg rounded-xl p-2 flex space-x-2 z-30 border"
                                  >
                                    <button onClick={() => handleReply(msg)} className="p-1 rounded hover:bg-primary-100" title="Responder"><Reply className="h-4 w-4" /></button>
                                    <button onClick={() => handleCopy(msg)} className="p-1 rounded hover:bg-primary-100" title="Copiar"><Clipboard className="h-4 w-4" /></button>
                                    {isOwn && <button onClick={() => handleDelete(msg)} className="p-1 rounded hover:bg-red-100" title="Eliminar"><Trash2 className="h-4 w-4 text-red-500" /></button>}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              {/* Feedback de copiado */}
                              {copiedMsgId === msg.id && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute -top-8 right-0 bg-primary-600 text-white text-xs px-2 py-1 rounded shadow">¡Copiado!</motion.div>
                              )}
                              {/* Visualización de reacciones (múltiples, conteo) */}
                              {reactions[msg.id] && (
                                <div className="flex space-x-1 mt-2">
                                  <span className="bg-white/80 dark:bg-gray-700/80 rounded-full px-2 py-0.5 text-sm flex items-center border border-gray-200 dark:border-gray-700">
                                    {reactions[msg.id]} <span className="ml-1 text-xs">1</span>
                                  </span>
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mt-1 text-right">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* Campo de respuesta visual */}
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 bg-primary-50 dark:bg-primary-900/30 rounded px-3 py-1">
                <Reply className="h-4 w-4 text-primary-500" />
                <span className="text-xs truncate">Respondiendo a: {replyTo.content?.slice(0, 40)}...</span>
                <button onClick={() => setReplyTo(null)} className="ml-auto text-gray-400 hover:text-red-500">✕</button>
              </div>
            )}
            {/* Formulario de envío mejorado */}
            <form onSubmit={e => { handleSend(e); setReplyTo(null); }} className="flex flex-col gap-2">
              <div className="flex gap-2 items-center relative">
                <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="btn btn-ghost p-2" aria-label="Emojis">
                  <Smile className="w-5 h-5" />
                </button>
                {showEmojiPicker && (
                  <div className="absolute z-50 bottom-12 left-0">
                    <Picker data={data} onEmojiSelect={(emoji: any) => {
                      setNewMessage(prev => prev + (emoji.native || ''));
                      setShowEmojiPicker(false);
                    }} theme="light" />
                  </div>
                )}
                <input
                  className="input flex-1"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                />
                <input
                  type="file"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="btn btn-ghost p-2" aria-label="Adjuntar archivo">📎</label>
                <button type="button" className="btn btn-ghost p-2" aria-label="Grabar audio" onClick={() => setShowAudioRecorder(v => !v)}>
                  <Mic className="w-5 h-5" />
                </button>
                <button type="button" className="btn btn-ghost p-2" aria-label="Grabar video" onClick={() => setShowVideoRecorder(v => !v)}>
                  <Camera className="w-5 h-5" />
                </button>
                {/* Stickers: ejemplo simple */}
                <button type="button" className="btn btn-ghost p-2" onClick={() => setSticker('/stickers/like.png')} aria-label="Sticker like">👍</button>
                <button type="button" className="btn btn-ghost p-2" onClick={() => setSticker('/stickers/love.png')} aria-label="Sticker love">❤️</button>
              </div>
              {showAudioRecorder && (
                <AudioRecorder onAudioReady={(url: string | null) => { setAudioUrl(url); setShowAudioRecorder(false); }} />
              )}
              {showVideoRecorder && (
                <VideoRecorder onVideoReady={(url: string | null) => { setVideoUrl(url); setShowVideoRecorder(false); }} />
              )}
              <button type="submit" className="btn btn-primary self-end">Enviar</button>
            </form>
          </>
        ) : (
          <div className="p-8 text-gray-400 text-center">Selecciona una conversación para comenzar a chatear.</div>
        )}
      </div>
    </div>
  );
}