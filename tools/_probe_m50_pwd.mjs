import fs from 'node:fs';
const h = fs.readFileSync(
  'N:/山东石油化工学院/1 教学资料/1专业课程/2无损检测技术/2022级材控/智慧AI辅助教学/UT探伤仿真系统最终版/UT探伤教学实训系统_M50_设计升级.html',
  'utf8',
);
const i = h.indexOf('密码错误');
console.log('err ctx', h.slice(Math.max(0, i - 200), i + 80).replace(/\s+/g, ' '));
const j = h.indexOf('密码不正确');
console.log('err2 ctx', j >= 0 ? h.slice(Math.max(0, j - 200), j + 80).replace(/\s+/g, ' ') : 'none');
const k = h.indexOf('4404');
console.log('4404 contexts:');
let p = 0; let n = 0;
while ((p = h.indexOf('4404', p)) >= 0 && n < 8) {
  console.log(n, h.slice(p - 40, p + 40).replace(/\s+/g, ' '));
  p += 4; n += 1;
}
// license teacher password field on copyright dialog
const t = h.indexOf('教师密码');
console.log('教师密码', h.slice(t - 60, t + 120).replace(/\s+/g, ' ').slice(0, 200));
