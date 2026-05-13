"use client";

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { type Session } from '@supabase/supabase-js'
import Link from 'next/link'
import toast from 'react-hot-toast'

type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

type Reply = {
  id: number;
  content: string;
  created_at: string;
  post_id: number;
  author_email: string | null;
  user_id: string | null;
  profiles?: Profile | null;
}

type Post = {
  id: number;
  content: string;
  created_at: string;
  likes: number; 
  image_url: string | null;
  author_email: string | null;
  user_id: string | null;
  replies: Reply[];
  profiles?: Profile | null;
}

type Notification = {
  id: string;
  actor_id: string;
  type: 'like' | 'reply' | 'follow';
  post_id: number | null;
  is_read: boolean;
  created_at: string;
  actor_profile?: Profile;
}

const ADMIN_EMAIL = "takejiro.nakano0517@gmail.com"; 

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUpMode, setIsSignUpMode] = useState(false); 

  const [inputText, setInputText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const [editingReplyId, setEditingReplyId] = useState<number | null>(null);
  const [editReplyContent, setEditReplyContent] = useState("");

  const [likedPostIds, setLikedPostIds] = useState<number[]>([]);
  const [dmPartners, setDmPartners] = useState<Profile[]>([]);

  // タブ切り替え・検索・ページネーション用のState
  const [activeTab, setActiveTab] = useState<'all' | 'following'>('all');
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  
  const POSTS_PER_PAGE = 10;
  const [postLimit, setPostLimit] = useState(POSTS_PER_PAGE);
  const [hasMorePosts, setHasMorePosts] = useState(false);

  // 通知用のState
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Profile Edit State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchDMPartners(session.user.id);
        fetchNotifications(session.user.id);
        const savedLikes = localStorage.getItem(`liked_posts_${session.user.id}`);
        if (savedLikes) setLikedPostIds(JSON.parse(savedLikes));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchDMPartners(session.user.id);
        fetchNotifications(session.user.id);
        const savedLikes = localStorage.getItem(`liked_posts_${session.user.id}`);
        if (savedLikes) setLikedPostIds(JSON.parse(savedLikes));
      } else {
        setProfile(null);
        setLikedPostIds([]); 
        setDmPartners([]);
        setNotifications([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchPosts(activeTab, activeSearch, postLimit);
  }, [activeTab, session, activeSearch, postLimit]);

  // リアルタイム通知の受信設定（Websocket通信）
  useEffect(() => {
    if (!session?.user?.id) return;

    const notificationChannel = supabase
      .channel(`realtime:notifications:${session.user.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications', 
        filter: `user_id=eq.${session.user.id}` 
      }, () => {
        // 新しい通知がDBにインサートされたら、即座に再取得して画面右上にトーストを出す
        fetchNotifications(session.user.id);
        toast("新しい通知が届きました！", { icon: '🔔', style: { background: '#4f46e5', color: '#fff' } });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
    };
  }, [session?.user?.id]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
      setEditDisplayName(data.display_name || "");
      setEditBio(data.bio || "");
    }
  };

  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('*, actor_profile:profiles!actor_id(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      const formatted = data.map(n => ({
        ...n,
        actor_profile: Array.isArray(n.actor_profile) ? n.actor_profile[0] : n.actor_profile
      }));
      setNotifications(formatted as Notification[]);
    }
  };

  const markNotificationsAsRead = async () => {
    if (!session) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const fetchDMPartners = async (userId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    if (data && data.length > 0) {
      const partnerIds = Array.from(new Set(data.map(m => m.sender_id === userId ? m.receiver_id : m.sender_id)));
      if (partnerIds.length > 0) {
        const { data: partnersData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', partnerIds);
        if (partnersData) setDmPartners(partnersData);
      }
    } else {
      setDmPartners([]);
    }
  };

  const fetchPosts = async (tab: 'all' | 'following', search: string = "", limit: number = POSTS_PER_PAGE) => {
    let query = supabase
      .from('posts')
      .select('*, profiles(*), replies(*, profiles(*))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, limit - 1);

    if (search.trim() !== "") {
      query = query.ilike('content', `%${search.trim()}%`);
    }

    if (tab === 'following' && session?.user?.id) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', session.user.id);
      
      const followingIds = follows?.map(f => f.following_id) || [];
      followingIds.push(session.user.id); 

      if (followingIds.length > 0) {
        query = query.in('user_id', followingIds);
      }
    }

    const { data, count, error } = await query;

    if (!error) {
      const formattedData = data?.map(post => ({
        ...post,
        profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
        replies: post.replies ? post.replies.map((r: any) => ({
          ...r,
          profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        })).sort((a: Reply, b: Reply) => a.created_at.localeCompare(b.created_at)) : []
      })) || [];
      setPosts(formattedData as Post[]);
      if (count !== null) {
        setHasMorePosts(data ? data.length < count : false);
      }
    }
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error("ログイン失敗: " + error.message);
    else { 
      toast.success("ログインしました");
      setEmail(""); setPassword(""); 
    }
  };

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) toast.error("登録失敗: " + error.message);
    else {
      toast.success("登録成功！そのままログインできます。");
      setEmail(""); setPassword(""); setIsSignUpMode(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("ログアウトしました");
  };

  const handleUpdateProfile = async () => {
    if (!session) return;
    let avatarUrl = profile?.avatar_url;

    if (editAvatarFile) {
      toast.loading("画像をアップロード中...", { id: "upload" });
      const fileExt = editAvatarFile.name.split('.').pop();
      const fileName = `avatar_${session.user.id}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('image').upload(fileName, editAvatarFile);
      
      if (!uploadError) {
        const { data } = supabase.storage.from('image').getPublicUrl(fileName);
        avatarUrl = data.publicUrl;
      }
      toast.dismiss("upload");
    }

    const { error } = await supabase.from('profiles').update({
      display_name: editDisplayName,
      avatar_url: avatarUrl,
      bio: editBio
    }).eq('id', session.user.id);

    if (!error) {
      toast.success("プロフィールを更新しました！");
      setIsProfileModalOpen(false);
      fetchProfile(session.user.id);
      fetchPosts(activeTab, activeSearch, postLimit); 
    } else {
      toast.error("更新に失敗しました");
    }
  };

  const handlePost = async () => {
    if (inputText.trim() === "" && !file) return;

    let uploadedImageUrl = null;
    if (file) {
      toast.loading("画像をアップロード中...", { id: "post-upload" });
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('image').upload(fileName, file);
      if (!uploadError) {
        const { data } = supabase.storage.from('image').getPublicUrl(fileName);
        uploadedImageUrl = data.publicUrl;
      }
      toast.dismiss("post-upload");
    }

    const { error } = await supabase.from('posts').insert([{ 
      content: inputText,
      image_url: uploadedImageUrl,
      author_email: session?.user?.email || "匿名ユーザー",
      user_id: session?.user?.id
    }]);

    if (!error) { 
      toast.success("投稿しました！");
      setInputText(""); setFile(null); fetchPosts(activeTab, activeSearch, postLimit); 
    }
  };

  const handleDelete = async (id: number) => {
    await supabase.from('posts').delete().eq('id', id);
    toast.success("投稿を削除しました");
    fetchPosts(activeTab, activeSearch, postLimit);
  };

  const handleUpdate = async (id: number) => {
    if (editContent.trim() === "") return;
    await supabase.from('posts').update({ content: editContent }).eq('id', id);
    toast.success("投稿を編集しました");
    setEditingId(null); fetchPosts(activeTab, activeSearch, postLimit);
  };

  const handleLike = async (id: number, currentLikes: number, postUserId: string | null) => {
    if (!session) return;
    if (likedPostIds.includes(id)) return;
    const newLikes = (currentLikes || 0) + 1;
    const { error } = await supabase.from('posts').update({ likes: newLikes }).eq('id', id);
    
    if (!error) {
      // 自分の投稿以外にいいねした場合は通知を送る
      if (postUserId && postUserId !== session?.user?.id) {
        await supabase.from('notifications').insert({
          user_id: postUserId,
          actor_id: session.user.id,
          type: 'like',
          post_id: id
        });
      }

      fetchPosts(activeTab, activeSearch, postLimit);
      const newLikedIds = [...likedPostIds, id];
      setLikedPostIds(newLikedIds);
      localStorage.setItem(`liked_posts_${session?.user?.id || 'guest'}`, JSON.stringify(newLikedIds));
    }
  };

  const handleReply = async (postId: number, postUserId: string | null) => {
    if (!session) return;
    if (replyContent.trim() === "") return;
    const { error } = await supabase.from('replies').insert([{ 
      content: replyContent, 
      post_id: postId,
      author_email: session?.user?.email || "匿名ユーザー",
      user_id: session?.user?.id
    }]);

    if (!error) {
      if (postUserId && postUserId !== session?.user?.id) {
        await supabase.from('notifications').insert({
          user_id: postUserId,
          actor_id: session.user.id,
          type: 'reply',
          post_id: postId
        });
      }
      toast.success("返信しました");
      setReplyingToId(null); setReplyContent(""); fetchPosts(activeTab, activeSearch, postLimit);
    }
  };

  const handleDeleteReply = async (id: number) => {
    await supabase.from('replies').delete().eq('id', id);
    toast.success("返信を削除しました");
    fetchPosts(activeTab, activeSearch, postLimit);
  };

  const handleUpdateReply = async (id: number) => {
    if (editReplyContent.trim() === "") return;
    await supabase.from('replies').update({ content: editReplyContent }).eq('id', id);
    toast.success("返信を編集しました");
    setEditingReplyId(null); fetchPosts(activeTab, activeSearch, postLimit);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        
        {/* ログインエリア */}
        <div className="bg-gray-900 p-4 rounded-xl mb-8 flex flex-col md:flex-row justify-between items-center shadow-lg border border-gray-800">
          {session ? (
            <div className="flex w-full justify-between items-center">
              <div className="flex items-center gap-4">
                
                {/* 通知ベル */}
                <div className="relative">
                  <button 
                    onClick={() => { 
                      setShowNotifications(!showNotifications); 
                      if(!showNotifications) markNotificationsAsRead(); 
                    }}
                    className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full text-xl relative transition-colors shadow-inner"
                  >
                    🔔
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {/* 通知ポップアップ */}
                  {showNotifications && (
                    <div className="absolute top-full mt-3 left-0 md:left-auto md:right-0 w-72 md:w-80 max-h-96 overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50">
                      <div className="sticky top-0 bg-gray-900 p-3 border-b border-gray-800 flex justify-between items-center z-10">
                        <h3 className="text-sm font-bold text-gray-300">通知</h3>
                        <button onClick={() => setShowNotifications(false)} className="text-gray-500 hover:text-gray-300">✕</button>
                      </div>
                      <div className="p-2">
                        {notifications.length === 0 ? (
                          <p className="text-gray-500 text-sm p-4 text-center">通知はありません</p>
                        ) : (
                          notifications.map(n => (
                            <div key={n.id} className={`p-3 rounded-lg mb-2 flex items-start gap-3 transition-colors ${n.is_read ? 'opacity-60' : 'bg-gray-800/80 border border-indigo-500/30'}`}>
                              <Link href={`/profile/${n.actor_id}`}>
                                {n.actor_profile?.avatar_url ? (
                                  <img src={n.actor_profile.avatar_url} className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-700" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-sm shrink-0 border border-gray-700">
                                    {n.actor_profile?.display_name?.charAt(0) || "?"}
                                  </div>
                                )}
                              </Link>
                              <div className="text-sm text-gray-200">
                                <Link href={`/profile/${n.actor_id}`} className="font-bold text-indigo-400 hover:underline">
                                  {n.actor_profile?.display_name || "誰か"}
                                </Link>
                                さんが
                                {n.type === 'like' && "あなたの投稿にいいねしました"}
                                {n.type === 'reply' && "あなたに返信しました"}
                                {n.type === 'follow' && "あなたをフォローしました"}
                                <div className="text-xs text-gray-500 mt-1">{new Date(n.created_at).toLocaleString('ja-JP')}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Link href={`/profile/${session.user.id}`}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-gray-700 hover:opacity-80 transition-opacity shadow-md" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold hover:opacity-80 transition-opacity shadow-md">
                      {profile?.display_name?.charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                </Link>
                <div className="hidden md:block">
                  <Link href={`/profile/${session.user.id}`}>
                    <div className="font-bold text-gray-200 hover:text-indigo-400 transition-colors text-sm">{profile?.display_name || session.user.email}</div>
                  </Link>
                  <button onClick={() => setIsProfileModalOpen(true)} className="text-xs text-indigo-400 hover:text-indigo-300">設定を編集</button>
                </div>
              </div>
              <button onClick={handleLogout} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors shadow-md">
                ログアウト
              </button>
            </div>
          ) : (
            <div className="w-full">
              <div className="flex flex-col md:flex-row gap-3 w-full mb-3">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 p-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:border-indigo-500" />
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 p-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:border-indigo-500" />
                {isSignUpMode ? (
                  <button onClick={handleSignUp} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-white font-medium transition-colors">新規登録</button>
                ) : (
                  <button onClick={handleLogin} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition-colors">ログイン</button>
                )}
              </div>
              <div className="text-right">
                <button onClick={() => setIsSignUpMode(!isSignUpMode)} className="text-sm text-gray-400 hover:text-white underline">
                  {isSignUpMode ? "すでにアカウントをお持ちの方はこちら（ログイン）" : "初めての方はこちら（新規登録）"}
                </button>
              </div>
            </div>
          )}
        </div>

        <h1 className="text-3xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
          学習記録 スレッド掲示板 v2
        </h1>

        {/* 検索バー */}
        <div className="flex gap-2 mb-8">
          <div className="relative flex-1">
            <span className="absolute left-4 top-3 text-gray-500">🔍</span>
            <input 
              type="text" 
              value={searchInput} 
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setActiveSearch(searchInput);
                  setPostLimit(POSTS_PER_PAGE);
                }
              }}
              placeholder="投稿をキーワードで検索..." 
              className="w-full pl-11 pr-4 py-3 bg-gray-900 rounded-full border border-gray-700 focus:outline-none focus:border-indigo-500 text-sm shadow-inner"
            />
          </div>
          <button 
            onClick={() => { setActiveSearch(searchInput); setPostLimit(POSTS_PER_PAGE); }}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white font-bold transition-colors shadow-lg"
          >
            検索
          </button>
          {activeSearch && (
            <button 
              onClick={() => { setSearchInput(""); setActiveSearch(""); setPostLimit(POSTS_PER_PAGE); }}
              className="px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-full text-gray-300 font-bold transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* DM履歴エリア（Instagramのストーリー風） */}
        {session && dmPartners.length > 0 && (
          <div className="bg-gray-900 p-4 rounded-xl mb-8 shadow-lg border border-gray-800">
            <h2 className="text-xs font-bold text-gray-400 mb-3 flex items-center gap-2">
              <span>📩</span> 最近メッセージした人
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
              {dmPartners.map(partner => (
                <Link key={partner.id} href={`/messages/${partner.id}`} className="flex flex-col items-center gap-1 group min-w-[60px]">
                  {partner.avatar_url ? (
                    <img src={partner.avatar_url} alt="avatar" className="w-14 h-14 rounded-full object-cover border-2 border-transparent group-hover:border-indigo-500 transition-colors shadow-md" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold border-2 border-transparent group-hover:border-indigo-500 transition-colors shadow-md text-gray-300">
                      {partner.display_name?.charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="text-xs text-gray-400 group-hover:text-white truncate w-14 text-center mt-1 transition-colors">
                    {partner.display_name?.slice(0, 5) || "名無し"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* プロフィール編集モーダル */}
        {isProfileModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl max-w-sm w-full">
              <h2 className="text-xl font-bold mb-4">プロフィール編集</h2>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">表示名</label>
                <input type="text" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="w-full p-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">自己紹介</label>
                <textarea value={editBio} onChange={e => setEditBio(e.target.value)} className="w-full p-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:border-indigo-500 resize-none h-24" placeholder="よろしくお願いします！"></textarea>
              </div>
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-1">アイコン画像</label>
                <input type="file" accept="image/*" onChange={e => setEditAvatarFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20" />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setIsProfileModalOpen(false)} className="px-4 py-2 bg-gray-800 rounded text-sm">キャンセル</button>
                <button onClick={handleUpdateProfile} className="px-4 py-2 bg-indigo-600 rounded text-sm font-bold">保存</button>
              </div>
            </div>
          </div>
        )}

        {/* 投稿エリア */}
        {session && (
          <div className="bg-gray-900 p-5 rounded-xl mb-6 shadow-lg border border-gray-800">
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="今日学んだことは？" className="flex-1 p-3 bg-gray-800 rounded-lg border border-gray-700 focus:outline-none focus:border-emerald-500 text-lg" />
              <button onClick={handlePost} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-bold transition-all shadow-md hover:shadow-emerald-500/20">投稿</button>
            </div>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer text-gray-400 hover:text-gray-200 text-sm flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg border border-gray-700 transition-colors">
                <span>📸 画像を添付</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              {file && <span className="text-sm text-emerald-400">✔ {file.name}</span>}
            </div>
          </div>
        )}

        {/* タイムラインタブ */}
        {session && !activeSearch && (
          <div className="flex border-b border-gray-800 mb-6">
            <button 
              onClick={() => { setActiveTab('all'); setPostLimit(POSTS_PER_PAGE); }}
              className={`flex-1 py-3 text-center font-bold transition-colors ${activeTab === 'all' ? 'text-white border-b-2 border-emerald-500' : 'text-gray-500 hover:text-gray-300'}`}
            >
              すべて
            </button>
            <button 
              onClick={() => { setActiveTab('following'); setPostLimit(POSTS_PER_PAGE); }}
              className={`flex-1 py-3 text-center font-bold transition-colors ${activeTab === 'following' ? 'text-white border-b-2 border-emerald-500' : 'text-gray-500 hover:text-gray-300'}`}
            >
              フォロー中
            </button>
          </div>
        )}
        {activeSearch && (
          <div className="mb-6 text-emerald-400 font-bold">
            「{activeSearch}」の検索結果 ({posts.length}件)
          </div>
        )}

        {/* タイムライン */}
        <div className="space-y-6">
          {posts.length === 0 ? (
            <p className="text-gray-500 text-center py-10">投稿がありません。</p>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="bg-gray-900/50 p-5 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  {editingId === post.id ? (
                    <div className="flex gap-2 w-full">
                      <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className="flex-1 p-2 bg-gray-800 rounded border border-gray-700" />
                      <button onClick={() => handleUpdate(post.id)} className="px-4 py-2 bg-indigo-600 rounded">保存</button>
                      <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-700 rounded">取消</button>
                    </div>
                  ) : (
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-2 mb-2">
                        {post.user_id ? (
                          <Link href={`/profile/${post.user_id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity group">
                            {post.profiles?.avatar_url ? (
                              <img src={post.profiles.avatar_url} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">
                                {post.profiles?.display_name?.charAt(0).toUpperCase() || "?"}
                              </div>
                            )}
                            <span className="text-sm text-indigo-400 font-medium group-hover:underline">
                              {post.profiles?.display_name || post.author_email || "名無しユーザー"}
                            </span>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">?</div>
                            <span className="text-sm text-indigo-400 font-medium">{post.author_email || "名無しユーザー"}</span>
                          </div>
                        )}
                        <span className="text-xs text-gray-600 ml-2">{new Date(post.created_at).toLocaleString('ja-JP')}</span>
                      </div>
                      <p className="text-lg md:text-xl font-bold leading-relaxed break-words">{post.content}</p>
                      
                      {post.image_url && (
                        <div className="mt-4 rounded-lg overflow-hidden border border-gray-800 max-w-lg">
                          <img src={post.image_url} alt="投稿画像" className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500" />
                        </div>
                      )}

                      <div className="mt-4">
                        <button 
                          onClick={() => handleLike(post.id, post.likes, post.user_id)} 
                          disabled={likedPostIds.includes(post.id)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                            likedPostIds.includes(post.id) 
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-500 cursor-default" 
                              : "bg-gray-800 border-gray-700 text-gray-400 hover:border-rose-500/50 hover:text-rose-400"
                          }`}
                        >
                          {likedPostIds.includes(post.id) ? "❤️" : "♡"} {post.likes || 0}
                        </button>
                      </div>
                    </div>
                  )}

                  {session && editingId !== post.id && (
                    <div className="flex gap-2 shrink-0 items-start">
                      <button onClick={() => { setReplyingToId(post.id); setReplyContent(""); }} className="text-sm text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 rounded-md">返信</button>
                      {(session.user.email === post.author_email || session.user.email === ADMIN_EMAIL) && (
                        <>
                          <button onClick={() => { setEditingId(post.id); setEditContent(post.content); }} className="text-sm text-indigo-400 hover:text-indigo-300 px-3 py-1.5 bg-indigo-500/10 rounded-md">編集</button>
                          <button onClick={() => handleDelete(post.id)} className="text-sm text-rose-400 hover:text-rose-300 px-3 py-1.5 bg-rose-500/10 rounded-md">削除</button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {replyingToId === post.id && session && (
                  <div className="flex gap-2 ml-4 md:ml-8 mb-6 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                    <input type="text" value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="返信を入力..." className="flex-1 p-2 bg-gray-900 rounded border border-gray-700 text-sm" />
                    <button onClick={() => handleReply(post.id, post.user_id)} className="px-4 py-2 bg-emerald-600 rounded text-sm">送信</button>
                    <button onClick={() => setReplyingToId(null)} className="px-4 py-2 bg-gray-700 rounded text-sm">取消</button>
                  </div>
                )}

                {post.replies && post.replies.length > 0 && (
                  <div className="ml-4 md:ml-8 pl-4 border-l-2 border-gray-800 space-y-3 mt-4">
                    {post.replies.map((reply) => (
                      <div key={reply.id} className="bg-gray-800/30 p-3 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        {editingReplyId === reply.id ? (
                          <div className="flex gap-2 w-full">
                            <input type="text" value={editReplyContent} onChange={(e) => setEditReplyContent(e.target.value)} className="flex-1 p-1.5 bg-gray-900 rounded border border-gray-700 text-sm" />
                            <button onClick={() => handleUpdateReply(reply.id)} className="px-3 py-1 bg-indigo-600 rounded text-xs">保存</button>
                            <button onClick={() => setEditingReplyId(null)} className="px-3 py-1 bg-gray-700 rounded text-xs">取消</button>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 break-words">
                              <span className="text-xs text-indigo-400 font-medium mr-2 flex items-center gap-1 mb-1">
                                {reply.user_id ? (
                                  <Link href={`/profile/${reply.user_id}`} className="hover:underline flex items-center gap-1">
                                    {reply.profiles?.avatar_url ? (
                                      <img src={reply.profiles.avatar_url} alt="avatar" className="w-5 h-5 rounded-full object-cover inline" />
                                    ) : "👤"}
                                    {reply.profiles?.display_name || reply.author_email || "名無し"}
                                  </Link>
                                ) : (
                                  <>
                                    👤 {reply.author_email || "管理者"}
                                  </>
                                )}
                              </span>
                              <span className="text-sm text-gray-300">{reply.content}</span>
                            </div>
                            {session && (
                              <div className="flex gap-2 shrink-0">
                                {(session.user.email === reply.author_email || session.user.email === ADMIN_EMAIL) && (
                                  <>
                                    <button onClick={() => { setEditingReplyId(reply.id); setEditReplyContent(reply.content); }} className="text-xs text-indigo-400 hover:text-indigo-300">編集</button>
                                    <button onClick={() => handleDeleteReply(reply.id)} className="text-xs text-rose-400 hover:text-rose-300">削除</button>
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              </div>
            ))
          )}
        </div>

        {/* もっと読み込むボタン */}
        {hasMorePosts && posts.length > 0 && (
          <div className="text-center mt-8 pb-8">
            <button 
              onClick={() => setPostLimit(prev => prev + POSTS_PER_PAGE)}
              className="px-8 py-3 bg-gray-800 hover:bg-gray-700 rounded-full text-gray-300 font-bold transition-colors border border-gray-700 shadow-lg"
            >
              もっと読み込む ↓
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
