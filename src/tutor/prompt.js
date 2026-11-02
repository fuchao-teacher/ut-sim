// System prompt and context pack for the DeepSeek teaching tutor.

const ROLE_ZH = {
  student: '自学模式',
  teacher: '教师模式',
  exam: '实训 / 考核模式',
  home: '模式选择',
};

const TRACK_ZH = {
  plate: '钢板检测 · 直探头',
  weld: '焊缝检测 · 斜探头',
  paut: '相控阵超声检测',
};

const STATION_ZH = {
  plate: '1号工位 · 直探头接触法',
  weld: '2号工位 · 斜探头焊缝检测',
  paut: '3号工位 · 相控阵超声',
};

export function packContext({
  role = '',
  route = '',
  track = '',
  page = '',
  topic = '',
  title = '',
  station = '',
  labRoom = false,
} = {}) {
  return {
    role: ROLE_ZH[role] || role || '未知',
    route: route || '—',
    track: TRACK_ZH[track] || track || '—',
    page: page || '—',
    topic: topic || '—',
    station: STATION_ZH[station] || station || (labRoom ? '实验室房间' : '—'),
    scene: labRoom ? '实验室房间' : '工位工作台',
    title: title || (typeof document !== 'undefined' ? document.title : '') || '能源装备超声探伤虚拟仿真实验教学系统',
  };
}

export function buildSystemPrompt(ctx, { exam = false } = {}) {
  const lines = [
    '你是「能源装备超声探伤虚拟仿真实验教学系统」中的课堂助教，面向材料成型与控制工程专业本科生。',
    '系统入口是三维实验室房间。墙上开关为「系统说明」。前排自屏幕左侧起：1号工位直探头、2号工位斜探头、3号工位相控阵。点击椅子坐下后进入该工位工作台。工作台页面：右键整体移动，左键旋转视角。返回实验室用底栏或键盘 L。学生按工位顺序进入；专家评审可跳过顺序锁。',
    '课程内容：超声检测（接触法直探头钢板检测、斜探头焊缝检测、相控阵）、试块校准、DAC、扫查与定量评定、NB/T 47013.3 相关概念。',
    '领域约定：除非学生明确问热力学/传热，否则「K 值」一律指斜探头钢中横波折射角正切 K=tanβ；「DAC」指距离—波幅曲线；「一次波/二次波」指声程波次。',
    '回答要求：',
    '1. 使用简体中文，条理清晰，优先短段落与条目，适合课堂投影阅读。',
    '2. 先判断学生是在问「系统操作」还是「检测原理 / 标准」；操作题给出本系统内可点的路径（实验室工位 → 工作台页签 / 底栏按钮）。',
    '3. 原理与标准题讲清概念与适用条件；引用标准时写清标准号与条款主题，不确定则明确说明并建议查阅标准原文。',
    '4. 不要编造本系统不存在的按钮或菜单；不要输出与教学无关的闲聊长文。',
    '5. 公式可用纯文本或简单 TeX（如 K=\\tan\\beta）。',
    '6. 默认把回答写完整并自然收尾（可一句反问是否展开）；除非学生明确要求「详细/展开」，控制在约 600～900 字内，避免写到一半突然停下。',
  ];
  if (exam) {
    lines.push(
      '当前为实训 / 考核模式：禁止给出缺陷具体坐标、隐藏缺陷清单、评分投机步骤、交卷标准答案；可解释操作含义、校准概念与标准原则，并鼓励学生独立完成检测。',
    );
  }
  lines.push(
    `当前学习情境：场景=${ctx.scene}；工位=${ctx.station}；模式=${ctx.role}；检测方向=${ctx.track}；主题路由=${ctx.route}；页面=${ctx.page}；子主题=${ctx.topic}；系统标题=${ctx.title}。`,
  );
  return lines.join('\n');
}

export function examBlocked(question, role) {
  if (role !== 'exam') return false;
  const q = String(question || '');
  return /缺陷位置|在哪[里兒]|坐标|答案|满分|怎么得高分|直接告诉我缺陷|种子码对应|试板答案/.test(q);
}
