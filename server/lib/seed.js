// 慢行 SlowMoves — 初始种子数据
// 点位内容采用"同版本文字 + 替代说明"模型：地图、结构化列表、API 永远读取同一个 contentVersion。
export function createSeed() {
  const v1 = {
    version: 1,
    name: '',
    summary: '',
    textAlternative: '',
    easyRead: '',
    imageAlt: '',
    updatedAt: '2026-09-01T08:00:00.000Z'
  };
  // 生成一个内容版本（保持对象形状一致，便于校验）
  function content(overrides) {
    return { ...structuredClone(v1), ...overrides };
  }
  function point(p) {
    return {
      kind: 'poi',
      accessibility: {
        stepFree: true,
        wheelchair: 'full', // full | partial | none
        tactilePaving: 'full', // full | partial | none
        restSeating: true,
        shelter: false,
        accessibleToilet: false,
        lighting: 'good', // good | average | poor
        crowdLevel: 'medium', // low | medium | high
        quietArea: false,
        note: ''
      },
      image: { kind: 'svg', seed: p.id, alt: '' },
      currentVersion: 1,
      contentVersions: {},
      ...p
    };
  }
  const points = [
    point({
      id: 'p01', name: '断桥残雪', kind: 'view',
      lat: 30.2587, lng: 120.1458,
      accessibility: { stepFree: true, wheelchair: 'full', tactilePaving: 'partial', restSeating: true, shelter: false, accessibleToilet: false, lighting: 'good', crowdLevel: 'high', quietArea: false, note: '桥面平缓，但桥头有 2cm 门槛，轮椅可独立通过略颠簸。' },
      image: { kind: 'svg', seed: 'p01', alt: '白堤东端的单孔石拱桥，桥上游人眺望湖面。' },
      contentVersions: { 1: content({ name: '断桥残雪', summary: '白堤东端的石拱桥，西湖十景之一。', textAlternative: '你站在白堤起点，脚下是平整石板路。前方一座单孔石拱桥缓缓拱起，桥面无台阶，两侧有低矮石栏。向东是北山街，向西沿白堤可走到平湖秋月。', easyRead: '这是一座老石桥。路平，能推轮椅。人很多。', imageAlt: '白堤东端的单孔石拱桥，桥上游人眺望湖面。' }) }
    }),
    point({
      id: 'p02', name: '白堤', kind: 'path',
      lat: 30.2575, lng: 120.148,
      accessibility: { stepFree: true, wheelchair: 'full', tactilePaving: 'full', restSeating: true, shelter: false, accessibleToilet: false, lighting: 'good', crowdLevel: 'medium', quietArea: false, note: '全长约 1km，沥青路面，每隔约 200m 有长椅。' },
      image: { kind: 'svg', seed: 'p02', alt: '一条两侧种满桃树与柳树的湖堤，路面平整。' },
      contentVersions: { 1: content({ name: '白堤', summary: '连接断桥与平湖秋月的湖中长堤，平缓无坡。', textAlternative: '一条东西向的长堤把湖面分成两半。路面是深色沥青，宽约 4 米，没有台阶和陡坡。左手边是外湖，右手边是北里湖。沿途有三张长椅可以休息。', easyRead: '一条长长的平路。两边是湖和树。有椅子坐。', imageAlt: '一条两侧种满桃树与柳树的湖堤，路面平整。' }) }
    }),
    point({
      id: 'p03', name: '平湖秋月', kind: 'view',
      lat: 30.2569, lng: 120.1466,
      accessibility: { stepFree: true, wheelchair: 'full', tactilePaving: 'partial', restSeating: true, shelter: true, accessibleToilet: true, lighting: 'average', crowdLevel: 'low', quietArea: true, note: '御碑亭有三级台阶，旁设坡道；无障碍卫生间在亭西侧 30m。' },
      image: { kind: 'svg', seed: 'p03', alt: '临湖的木质观景平台与碑亭，水面平静。' },
      contentVersions: { 1: content({ name: '平湖秋月', summary: '白堤西端的临水平台，夜晚安静，适合慢坐。', textAlternative: '白堤走到尽头是一片木质平台，贴着湖面。平台与堤面等高，没有台阶。右边碑亭前有三级石阶，但亭子左侧有一条木坡道。亭子往西三十米是无障碍卫生间，有清晰标识。', easyRead: '路尽头有看湖的木平台。亭子旁边有坡，可以上去。有无障碍厕所。', imageAlt: '临湖的木质观景平台与碑亭，水面平静。' }) }
    }),
    point({
      id: 'p04', name: '苏堤春晓', kind: 'path',
      lat: 30.248, lng: 120.138,
      accessibility: { stepFree: false, wheelchair: 'partial', tactilePaving: 'none', restSeating: true, shelter: false, accessibleToilet: false, lighting: 'average', crowdLevel: 'medium', quietArea: false, note: '堤上六座石桥均为拱形台阶桥，轮椅需绕行，建议结伴。' },
      image: { kind: 'svg', seed: 'p04', alt: '跨湖长堤上的石拱桥，桥面有台阶。' },
      contentVersions: { 1: content({ name: '苏堤春晓', summary: '南北向跨湖长堤，六桥有台阶，轮椅通行受限。', textAlternative: '这是一条南北走向的长堤，柳树成荫。堤身本身平坦，但沿途六座桥都是拱形石桥，桥上是台阶，没有坡道。使用轮椅或推行婴儿车需要从堤外的杨公堤绕行。', easyRead: '很长的湖堤，树很多。桥上有台阶，轮椅过不去，要绕路。', imageAlt: '跨湖长堤上的石拱桥，桥面有台阶。' }) }
    }),
    point({
      id: 'p05', name: '花港观鱼', kind: 'park',
      lat: 30.239, lng: 120.137,
      accessibility: { stepFree: true, wheelchair: 'full', tactilePaving: 'partial', restSeating: true, shelter: true, accessibleToilet: true, lighting: 'good', crowdLevel: 'high', quietArea: false, note: '主园路无台阶，红鱼池观鱼平台有轮椅位。' },
      image: { kind: 'svg', seed: 'p05', alt: '公园池塘边的观鱼平台，水中有红色锦鲤。' },
      contentVersions: { 1: content({ name: '花港观鱼', summary: '苏堤南端的城市公园，主园路全程无台阶。', textAlternative: '公园大门对着南山路，入口没有门槛。主路是宽五米的水泥路，环绕鱼池一圈。红鱼池边的观景平台特意留了没有长椅的轮椅观看位。牡丹园区域有碎石小路，轮椅不太好走。', easyRead: '一个大公园。主路平，好推车。看鱼的地方留了轮椅位置。', imageAlt: '公园池塘边的观鱼平台，水中有红色锦鲤。' }) }
    }),
    point({
      id: 'p06', name: '雷峰塔', kind: 'landmark',
      lat: 30.2317, lng: 120.1472,
      accessibility: { stepFree: true, wheelchair: 'full', tactilePaving: 'partial', restSeating: true, shelter: true, accessibleToilet: true, lighting: 'good', crowdLevel: 'high', quietArea: false, note: '塔内有直达电梯，塔前广场坡道长但平缓。' },
      image: { kind: 'svg', seed: 'p06', alt: '夕照山上的五层铜色宝塔，飞檐翘角。' },
      contentVersions: { 1: content({ name: '雷峰塔', summary: '夕照山上的古塔，内设电梯，可无障碍登塔。', textAlternative: '塔在一座小山上。山脚到塔前广场是一条长约一百五十米的缓坡道，坡度约 1:14，中途有两处休息平台。新塔内部有直达顶层的电梯，塔外各层是平层观景走廊。', easyRead: '山上有座塔。上山是长坡，慢慢推可以上去。塔里有电梯。', imageAlt: '夕照山上的五层铜色宝塔，飞檐翘角。' }) }
    }),
    point({
      id: 'p07', name: '长桥公园', kind: 'rest',
      lat: 30.235, lng: 120.156,
      accessibility: { stepFree: true, wheelchair: 'full', tactilePaving: 'full', restSeating: true, shelter: true, accessibleToilet: false, lighting: 'good', crowdLevel: 'low', quietArea: true, note: '安静的临湖小公园，长椅多，适合中途休整。' },
      image: { kind: 'svg', seed: 'p07', alt: '湖边小公园，长椅朝向湖面，树木疏朗。' },
      contentVersions: { 1: content({ name: '长桥公园', summary: '雷峰塔东北侧的临湖小公园，人少、座椅多。', textAlternative: '沿南山路向北走十分钟，右手边出现一片开放式草地公园。这里没有围墙和门槛，沿湖摆了十几张背对马路的长椅。附近没有公共卫生间，最近的在雷峰塔景区内。', easyRead: '湖边上的小公园。人少，椅子多，可以休息。附近没有厕所。', imageAlt: '湖边小公园，长椅朝向湖面，树木疏朗。' }) }
    }),
    point({
      id: 'p08', name: '柳浪闻莺', kind: 'park',
      lat: 30.245, lng: 120.157,
      accessibility: { stepFree: true, wheelchair: 'full', tactilePaving: 'partial', restSeating: true, shelter: true, accessibleToilet: true, lighting: 'good', crowdLevel: 'medium', quietArea: true, note: '闻莺馆门前有坡道，公园东北角设无障碍卫生间。' },
      image: { kind: 'svg', seed: 'p08', alt: '大片柳树林中的草地与曲折步道。' },
      contentVersions: { 1: content({ name: '柳浪闻莺', summary: '东海岸的城市公园，柳树林下步道平缓。', textAlternative: '公园紧邻湖滨路，入口是一个小广场。主步道用石板铺成，有轻微起伏但没有台阶，路边是大片柳树林。闻莺馆茶室大门朝南，门前有一段短坡道。东北角有一间无障碍卫生间。', easyRead: '湖边公园，很多柳树。路基本是平的。茶室门口有坡。有厕所。', imageAlt: '大片柳树林中的草地与曲折步道。' }) }
    }),
    point({
      id: 'p09', name: '湖滨步行道', kind: 'path',
      lat: 30.253, lng: 120.162,
      accessibility: { stepFree: true, wheelchair: 'full', tactilePaving: 'full', restSeating: true, shelter: false, accessibleToilet: true, lighting: 'good', crowdLevel: 'high', quietArea: false, note: '全程盲道连续，路口均为缘石坡道，音乐喷泉时段很挤。' },
      image: { kind: 'svg', seed: 'p09', alt: '宽阔的临湖步行街，地面有黄色盲道。' },
      contentVersions: { 1: content({ name: '湖滨步行道', summary: '东侧商业区的临湖步行街，盲道连续、无机动车。', textAlternative: '这是一条贴着湖东岸的宽阔步行街，只允许步行。地面铺砖平整，靠湖一侧有连续的黄色盲道。每条横向路口都是缘石坡道，没有高低差。晚上七点到八点有音乐喷泉，人非常多。', easyRead: '湖边的大马路，只走人。地上有盲道，路口没有台阶。晚上喷泉时人很多。', imageAlt: '宽阔的临湖步行街，地面有黄色盲道。' }) }
    }),
    point({
      id: 'p10', name: '曲院风荷', kind: 'park',
      lat: 30.258, lng: 120.133,
      accessibility: { stepFree: true, wheelchair: 'partial', tactilePaving: 'none', restSeating: true, shelter: true, accessibleToilet: true, lighting: 'average', crowdLevel: 'medium', quietArea: true, note: '荷池区有三座小木桥有门槛，主园路可通。' },
      image: { kind: 'svg', seed: 'p10', alt: '荷叶密布的池塘与曲折木桥。' },
      contentVersions: { 1: content({ name: '曲院风荷', summary: '西北角的荷花主题园林，主路可通行，小木桥有门槛。', textAlternative: '园林在杨公堤和北山街之间。进门后的主园路是平整石板，可以绕荷花池一圈。深入池中的三座小木桥两端各有约八厘米高的木门槛，轮椅无法独立通过。无障碍卫生间在南门入口左侧。', easyRead: '看荷花的园子。大路能推车。小木头桥有门槛，过不去。南门有厕所。', imageAlt: '荷叶密布的池塘与曲折木桥。' }) }
    }),
    point({
      id: 'p11', name: '岳王庙公交站', kind: 'transport',
      lat: 30.259, lng: 120.1345,
      accessibility: { stepFree: true, wheelchair: 'partial', tactilePaving: 'partial', restSeating: true, shelter: true, accessibleToilet: false, lighting: 'good', crowdLevel: 'medium', quietArea: false, note: '7 路与 27 路为低地板公交车，站台北端有盲道断开。' },
      image: { kind: 'svg', seed: 'p11', alt: '带遮雨棚的公交站台，站牌显示 7 路。' },
      contentVersions: { 1: content({ name: '岳王庙公交站', summary: '北山路的公交站点，可乘 7 路、27 路低地板车。', textAlternative: '车站在北山路边，紧挨着岳王庙正门。站台比路面高二十厘米，南端有缓坡连接人行道。七路和二十七路使用低地板公交车，可翻出坡道。站台北端约十米没有盲道。', easyRead: '公车站。7 路和 27 路车可以放下坡板。站台一头的盲道断了。', imageAlt: '带遮雨棚的公交站台，站牌显示 7 路。' }) }
    }),
    point({
      id: 'p12', name: '茅家埠', kind: 'rest',
      lat: 30.244, lng: 120.129,
      accessibility: { stepFree: false, wheelchair: 'none', tactilePaving: 'none', restSeating: true, shelter: true, accessibleToilet: false, lighting: 'poor', crowdLevel: 'low', quietArea: true, note: '乡间石板路起伏大，多处台阶，无夜间照明，不建议轮椅独自前往。' },
      image: { kind: 'svg', seed: 'p12', alt: '芦苇水塘边的旧式石板村路。' },
      contentVersions: { 1: content({ name: '茅家埠', summary: '西侧的水乡村落，野趣足但通行障碍多。', textAlternative: '这里原来是西湖边的村落，保留了弯弯曲曲的石板小路。路面起伏明显，靠近水塘处有多级台阶，没有盲道，也几乎没有路灯。这里很安静、游客少，但轮椅使用者和视障旅行者不建议独自进入。', easyRead: '老村子，小路弯，有台阶。没有盲道，晚上黑。轮椅一个人不要去。', imageAlt: '芦苇水塘边的旧式石板村路。' }) }
    })
  ];

  const routes = [
    {
      id: 'r1',
      name: '西湖东岸平缓环线',
      mode: 'walk',
      summary: '全程无台阶、盲道基本连续的湖滨慢走环线，含两个休息点与一间无障碍卫生间。',
      distanceKm: 5.2,
      durationMin: 75,
      stopIds: ['p01', 'p02', 'p03', 'p08', 'p07', 'p09'],
      textAlternative: '从断桥出发，沿白堤向西走到平湖秋月，折返后向南经柳浪闻莺、长桥公园，再沿湖滨步行道向北回到起点。除白堤局部盲道不连续外，全程无台阶。'
    },
    {
      id: 'r2',
      name: '南线无障碍探游线',
      mode: 'wheelchair',
      summary: '以轮椅可独立通行为标准挑选的南线点位，含电梯登塔与临湖休整点。',
      distanceKm: 3.8,
      durationMin: 70,
      stopIds: ['p05', 'p06', 'p07', 'p08'],
      textAlternative: '从花港观鱼出发，沿南山路缓坡上雷峰塔乘电梯登塔，下塔后到长桥公园休息，最后进入柳浪闻莺。全程缘石坡道，三个点位均有无障碍卫生间。'
    }
  ];

  const users = {
    demo: {
      userId: 'demo',
      baseFontRem: 1,
      highContrast: false,
      reduceMotion: false,
      defaultStepFree: false,
      defaultQuiet: false,
      updatedAt: '2026-09-15T10:00:00.000Z',
      rev: 3
    }
  };

  return {
    meta: { createdAt: new Date().toISOString(), contentSequence: 1 },
    points,
    routes,
    users
  };
}
