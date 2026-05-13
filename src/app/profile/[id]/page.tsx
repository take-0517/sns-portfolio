"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { type Session } from '@supabase/supabase-js';

type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

type Post = {
  id: number;
  content: string;
  created_at: string;
  likes: number; 
  image_url: string | null;
  user_id: string | null;
  profiles?: Profile | null;
}

export default function ProfilePage() {
  const params = useParams();
  const userId = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedPostIds, setLikedPostIds] = useState<number[]>([]);
  const [session, setSession] = useState<Session | null>(null);

  // フォロー機能用のState
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    const initData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) {
        const savedLikes = localStorage.getItem(`liked_posts_${session.user.id}`);
        if (savedLikes) setLikedPostIds(JSON.parse(savedLikes));
      }
      if (userId) {
        fetchProfileAndPosts();
        fetchFollowData(session?.user?.id);
      }
    };
    initData();
  }, [userId]);

  const fetchFollowData = async (currentUserId: string | undefined) => {
    // フォロワー数（このユーザーをフォローしている人）
    const { count: followers } = await supabase.from('follows')
      .select('*', { count: 'exact', head: true }).eq('following_id', userId);
    setFollowerCount(followers || 0);

    // フォロー数（このユーザーがフォローしている人）
    const { count: following } = await supabase.from('follows')
      .select('*', { count: 'exact', head: true }).eq('follower_id', userId);
    setFollowingCount(following || 0);

    // 自分がフォローしているかチェック（0件の場合はエラーにならないように maybeSingle を使う）
    if (currentUserId && currentUserId !== userId) {
      const { data } = await supabase.from('follows')
        .select('*').eq('follower_id', currentUserId).eq('following_id', userId).maybeSingle();
      setIsFollowing(!!data);
    }
  };

  const handleFollowToggle = async () => {
    if (!session) return;
    
    if (isFollowing) {
      await supabase.from('follows').delete()
        .eq('follower_id', session.user.id)
        .eq('following_id', userId);
      setIsFollowing(false);
      setFollowerCount(prev => prev - 1);
    } else {
      await supabase.from('follows').insert({
        follower_id: session.user.id,
        following_id: userId
      });
      setIsFollowing(true);
      setFollowerCount(prev => prev + 1);
      
      // 通知を送る
      await supabase.from('notifications').insert({
        user_id: userId,
        actor_id: session.user.id,
        type: 'follow'
      });
    }
  };

  const handleLike = async (id: number, currentLikes: number) => {
    if (likedPostIds.includes(id)) return;
    const newLikes = (currentLikes || 0) + 1;
    const { error } = await supabase.from('posts').update({ likes: newLikes }).eq('id', id);
    
    if (!error) {
      setPosts(posts.map(post => post.id === id ? { ...post, likes: newLikes } : post));
      const newLikedIds = [...likedPostIds, id];
      setLikedPostIds(newLikedIds);
      localStorage.setItem(`liked_posts_${session?.user?.id || 'guest'}`, JSON.stringify(newLikedIds));
    }
  };

  const fetchProfileAndPosts = async () => {
    setLoading(true);
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (profileData) setProfile(profileData);

    const { data: postsData } = await supabase.from('posts')
      .select('*, profiles(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (postsData) {
      const formattedPosts = postsData.map(post => ({
        ...post,
        profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles
      }));
      setPosts(formattedPosts as Post[]);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">読み込み中...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-emerald-400 hover:text-emerald-300 flex items-center gap-2 mb-6 transition-colors">
          <span className="text-xl">←</span> タイムラインに戻る
        </Link>

        {/* プロフィールヘッダー */}
        <div className="bg-gray-900 p-8 rounded-xl mb-8 shadow-2xl border border-gray-800 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-indigo-900/50 to-purple-900/50"></div>
          
          <div className="relative z-10">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-28 h-28 rounded-full object-cover border-4 border-gray-900 mx-auto mb-4 shadow-xl" />
            ) : (
              <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-4xl font-bold mx-auto mb-4 shadow-xl border-4 border-gray-900">
                {profile?.display_name?.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-100 mb-2">{profile?.display_name || "名無しユーザー"}</h1>
            
            {/* フォロー情報 */}
            <div className="flex justify-center gap-6 mb-4 text-sm">
              <div className="text-gray-400"><strong className="text-white text-lg">{followingCount}</strong> フォロー中</div>
              <div className="text-gray-400"><strong className="text-white text-lg">{followerCount}</strong> フォロワー</div>
            </div>

            <div className="bg-gray-950/50 p-4 rounded-lg inline-block text-left max-w-md w-full border border-gray-800/50">
              <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                {profile?.bio || "自己紹介はまだありません。"}
              </p>
            </div>

            {/* ボタン群 */}
            {session?.user?.id && session.user.id !== userId && (
              <div className="mt-6 flex justify-center gap-3">
                <button 
                  onClick={handleFollowToggle}
                  className={`px-6 py-2 rounded-full font-bold transition-all duration-300 shadow-lg ${
                    isFollowing 
                      ? "bg-gray-800 hover:bg-rose-900/50 text-white border border-gray-700 hover:border-rose-500/50 hover:text-rose-400" 
                      : "bg-white hover:bg-gray-200 text-gray-900"
                  }`}
                >
                  {isFollowing ? "フォロー中" : "フォローする"}
                </button>
                <Link href={`/messages/${userId}`} className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium transition-colors shadow-lg">
                  ✉️ DM
                </Link>
              </div>
            )}
          </div>
        </div>

        <h2 className="text-xl font-bold mb-6 border-b border-gray-800 pb-2 text-indigo-400 flex items-center gap-2">
          <span>📝</span> 過去の投稿 ({posts.length}件)
        </h2>

        {/* タイムライン */}
        <div className="space-y-6">
          {posts.length === 0 ? (
            <div className="bg-gray-900/30 p-10 rounded-xl border border-gray-800 border-dashed text-center">
              <p className="text-gray-500">まだ投稿がありません。</p>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="bg-gray-900/50 p-5 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-md">
                    {new Date(post.created_at).toLocaleString('ja-JP')}
                  </span>
                </div>
                <p className="text-lg md:text-xl font-bold leading-relaxed break-words text-gray-200">{post.content}</p>
                {post.image_url && (
                  <div className="mt-4 rounded-lg overflow-hidden border border-gray-800 max-w-lg">
                    <img src={post.image_url} alt="投稿画像" className="w-full h-auto object-cover" />
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <button 
                    onClick={() => handleLike(post.id, post.likes)} 
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
            ))
          )}
        </div>
      </div>
    </main>
  );
}
