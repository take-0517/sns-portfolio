"use client";

import { useState, useEffect } from "react";

// Go言語で定義したデータ構造と同じものを型定義
type Post = {
  id: number;
  name: string;
  content: string;
  created_at: string;
};

// 【重要】接続先をSupabaseではなく、あなたのAWSサーバーに設定！
const AWS_API_URL = "http://13.211.88.44/api/posts";

export default function AwsBBS() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  // 画面が開いたときに、AWSからデータを取ってくる (GET)
  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      // 魔法の呪文 fetch() これが本物のAPI通信です
      const res = await fetch(AWS_API_URL);
      const data = await res.json();
      setPosts(data);
    } catch (error) {
      console.error("AWSからのデータ取得に失敗:", error);
    }
  };

  // 投稿ボタンを押したときの処理 (POST)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !content) return;

    try {
      await fetch(AWS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // 入力された文字をJSONに変換してAWSにぶん投げる
        body: JSON.stringify({ name, content }), 
      });
      
      // 成功したら入力欄を空にして、データを再取得
      setName("");
      setContent("");
      fetchPosts(); 
    } catch (error) {
      console.error("AWSへの投稿に失敗:", error);
    }
  };

  // 削除処理 (DELETE)
  const handleDelete = async (id: number) => {
    try {
      await fetch(`${AWS_API_URL}/${id}`, {
        method: "DELETE",
      });
      fetchPosts(); // 削除後、データを再取得
    } catch (error) {
      console.error("AWSでの削除に失敗:", error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8 font-sans bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-black mb-8 text-center text-blue-600 tracking-wider">
        AWS × Go 独立記念掲示板
      </h1>
      
      {/* 投稿フォーム */}
      <form onSubmit={handleSubmit} className="mb-12 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-1">お名前</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl p-3 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition"
            placeholder="AWS太郎"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-1">メッセージ</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full border border-gray-300 rounded-xl p-3 h-28 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition"
            placeholder="Supabaseを卒業して、自力でサーバーを立てました！"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-transform shadow-md"
        >
          AWSのPostgreSQLに保存する
        </button>
      </form>

      {/* 投稿一覧表示エリア */}
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100">
              <span className="font-bold text-lg text-gray-800">{post.name}</span>
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                {new Date(post.created_at).toLocaleString('ja-JP')}
              </span>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{post.content}</p>
            <div className="mt-4 pt-3 text-right">
              <button
                onClick={() => handleDelete(post.id)}
                className="text-red-400 text-sm font-bold hover:text-red-600 transition"
              >
                削除
              </button>
            </div>
          </div>
        ))}
        
        {posts.length === 0 && (
          <div className="text-center p-10 bg-white rounded-2xl border border-dashed border-gray-300">
            <p className="text-gray-500 font-medium">まだ投稿はありません。</p>
            <p className="text-gray-400 text-sm mt-1">一番乗りでAWSにデータを送ってみましょう！</p>
          </div>
        )}
      </div>
    </div>
  );
}
