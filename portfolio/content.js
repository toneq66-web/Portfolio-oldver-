/* ─────────────────────────────────────────────
   기본 내용.
   사이트에서 ✎ 편집으로 고친 내용은 브라우저에 자동 저장됩니다.
   [파일로 저장]을 누르면 이 파일(content.js)이 새로 내려받아지니,
   이 파일과 바꿔 넣으면 다른 컴퓨터·배포할 때도 그대로 나옵니다.
   ───────────────────────────────────────────── */

const FRAME = 'assets/frame1.png';
const blank = (n) => ({
  brand: `Project ${n}`,
  tagline: '프로젝트 한 줄 소개',
  headline: '여기에 이 작품을\n대표하는 문장.',
  thumb: null, bg: null, tone: '#2b2f36',
  year: '2026', role: 'Product Design',
  logoMode: 'text', logo: null,
  sections: [
    { title: 'Overview', text: '프로젝트 개요를 적어주세요.', image: null },
    { title: 'Problem', text: '문제 정의를 적어주세요.', image: null },
    { title: 'Solution', text: '해결 방법을 적어주세요.', image: null },
  ],
});

const DEFAULT_CONTENT = {
  v: 2,
  start: 2,
  profile: {
    photo: { src: FRAME, crop: [30, 30, 162, 216] },
    name: 'Seungmo Kim',
    job: 'PRODUCT DESIGNER',
    school: 'Kookmin University',
    dept: 'College of Design\nDepartment of Industrial Design',
    title: 'From Problems to Value.',
    sub: '문제에서 시작해, 가치로 완성하다.',
    body: '저는 문제를 해결하기에 앞서, 문제를 바라보는 방식부터 고민합니다.\n\n당연하게 여겨지는 기존의 관점에 의문을 던지고, 익숙한 문제를 다른 시각으로 재해석합니다. 때로는 문제를 반대의 관점에서 바라보며 기존에는 발견하지 못했던 새로운 가능성을 찾아냅니다.\n\n이러한 사고를 바탕으로 단순히 형태를 만드는 데 그치지 않고, 논리적인 근거와 실용성을 갖춘 디자인을 통해 새로운 가치를 만들어가고자 합니다.',
    phone: '+82 10-6773-9002',
    email: 'monkhat0524@gmail.com',
    behance: 'behance.net/67b26904',
  },
  projects: [
    { ...blank('01'), thumb: { src: FRAME, crop: [900, 62, 50, 50] } },
    { ...blank('02'), thumb: { src: FRAME, crop: [876, 128, 74, 74] }, tone: '#2f3a2c' },
    {
      ...blank('03'),
      brand: 'lightsaver.',
      tagline: '은은히 안전한 캠핑을 지키는 빛',
      headline: '캠핑의 조명에서\n생명의 빛이 되는 순간까지.',
      thumb: { src: FRAME, crop: [851, 233, 98, 98] },
      bg: { src: FRAME, crop: [382, 0, 618, 563] },
      tone: '#3a2a1a',
      sections: [
        { title: 'Overview', text: '캠핑장에서 조명으로 쓰이다가, 위급한 순간에는 생명을 지키는 신호가 되는 랜턴.', image: null },
        { title: 'Problem', text: '문제 정의를 적어주세요.', image: null },
        { title: 'Solution', text: '해결 방법을 적어주세요.', image: null },
      ],
    },
    { ...blank('04'), thumb: { src: FRAME, crop: [876, 362, 74, 74] }, tone: '#33302c' },
    { ...blank('05'), thumb: { src: FRAME, crop: [900, 452, 50, 50] }, tone: '#2c2c33' },
  ],
};
