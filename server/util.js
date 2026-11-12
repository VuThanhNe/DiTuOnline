// Tiện ích: làm sạch tên/chat, lọc từ tục cơ bản (nên mở rộng danh sách trước khi phát hành).
const BAD_WORDS = ['đm', 'dm', 'đmm', 'vcl', 'vkl', 'cc', 'clm', 'lồn', 'lon', 'cặc', 'cak', 'buồi', 'địt', 'đụ', 'đéo', 'deo', 'ngu', 'chó', 'súc vật'];
const badRe = new RegExp(`(?<![\\p{L}\\p{N}])(${BAD_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'giu');

export function maskBad(s) {
  return s.replace(badRe, (m) => '*'.repeat(m.length));
}

export function cleanName(raw) {
  let s = String(raw ?? '').normalize('NFC').replace(/[^\p{L}\p{N} _\-.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  s = maskBad(s);
  return s || 'Tù nhân';
}

export function cleanChat(raw) {
  // bỏ ký tự điều khiển, <>, và ký tự vô hình/đảo chiều văn bản (U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069, U+FEFF)
  let s = String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return maskBad(s);
}

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
