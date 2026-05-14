FROM node:20-alpine

WORKDIR /app

# パッケージリストだけ先にコピーしてインストール（ビルド高速化のため）
COPY package.json package-lock.json* ./
RUN npm install

# 残りのソースコードをすべてコピー
COPY . .

# Next.jsのビルド
RUN npm run build

# 公開ポートの設定
EXPOSE 3000

# 起動コマンド
CMD ["npm", "start"]
