// Known brands from OMI competitive landscape
// Used for auto-resolving platform keywords when users add competitors
const KNOWN_BRANDS = [
  // Group D — 女包
  { name: '小CK', name_en: 'Charles & Keith', category: '女包', xhs_keyword: '小CK', douyin_keyword: '小CK', tmall_store: 'charleskeith', badge: '东南亚快时尚标杆' },
  { name: 'COACH', name_en: 'COACH', category: '女包', xhs_keyword: 'COACH包', douyin_keyword: 'COACH', tmall_store: 'coach', badge: '美式轻奢' },
  { name: 'MK', name_en: 'Michael Kors', category: '女包', xhs_keyword: 'MK包', douyin_keyword: 'MK', tmall_store: 'michaelkors', badge: '美式轻奢' },
  { name: 'Kipling', name_en: 'Kipling', category: '女包', xhs_keyword: 'Kipling', douyin_keyword: 'Kipling', tmall_store: 'kipling', badge: '功能休闲' },
  // Group C — 女包
  { name: 'La Festin', name_en: 'La Festin', category: '女包', xhs_keyword: 'La Festin', douyin_keyword: 'La Festin', badge: '法式定位' },
  { name: 'Cnolés蔻一', name_en: 'Cnoles', category: '女包', xhs_keyword: '蔻一', douyin_keyword: '蔻一', badge: '国产设计师' },
  { name: 'ECODAY', name_en: 'ECODAY', category: '女包', xhs_keyword: 'ECODAY', douyin_keyword: 'ECODAY', badge: '环保定位' },
  { name: 'VINEY', name_en: 'VINEY', category: '女包', xhs_keyword: 'VINEY包', douyin_keyword: 'VINEY', badge: '性价比' },
  { name: 'FOXER', name_en: 'FOXER', category: '女包', xhs_keyword: 'FOXER', douyin_keyword: 'FOXER', badge: '中端女包' },
  { name: 'muva', name_en: 'muva', category: '女包', xhs_keyword: 'muva包', douyin_keyword: 'muva', badge: '极简风' },
  // Group B — 女包
  { name: 'Songmont', name_en: 'Songmont', category: '女包', xhs_keyword: 'Songmont', douyin_keyword: 'Songmont', badge: '国货高端' },
  { name: '古良吉吉', name_en: 'Guliang Jiji', category: '女包', xhs_keyword: '古良吉吉', douyin_keyword: '古良吉吉', badge: '国货匠心' },
  { name: '裘真', name_en: 'Qiuzhen', category: '女包', xhs_keyword: '裘真', douyin_keyword: '裘真', badge: '国货轻奢' },
  { name: 'DISSONA', name_en: 'DISSONA', category: '女包', xhs_keyword: 'DISSONA', douyin_keyword: 'DISSONA', badge: '国货优质' },
  { name: 'CASSILE', name_en: 'CASSILE', category: '女包', xhs_keyword: 'CASSILE', douyin_keyword: 'CASSILE', badge: '新兴竞品' },
  { name: '红谷', name_en: 'Honggu', category: '女包', xhs_keyword: '红谷', douyin_keyword: '红谷', badge: '成熟国货皮具' },
  { name: 'Amazing Song', name_en: 'Amazing Song', category: '女包', xhs_keyword: 'Amazing Song', douyin_keyword: 'Amazing Song', badge: '国货设计师' },
  { name: '西木汀', name_en: 'Ximuting', category: '女包', xhs_keyword: '西木汀', douyin_keyword: '西木汀', badge: '新兴国货' },
  { name: 'NUCELLE', name_en: 'NUCELLE', category: '女包', xhs_keyword: 'NUCELLE', douyin_keyword: 'NUCELLE', badge: '女包品牌' },
  { name: 'OMTO', name_en: 'OMTO', category: '女包', xhs_keyword: 'OMTO', douyin_keyword: 'OMTO', badge: '新兴品牌' },
];

function getKnownBrands() {
  return KNOWN_BRANDS;
}

/**
 * Search brands by name, english name, or category.
 * searchBrands('女包') → all bag brands
 * searchBrands('Song') → Songmont, Amazing Song
 */
function searchBrands(query) {
  const q = query.toLowerCase();
  return KNOWN_BRANDS.filter(b =>
    b.name.toLowerCase().includes(q) ||
    (b.name_en && b.name_en.toLowerCase().includes(q)) ||
    (b.category && b.category.toLowerCase().includes(q))
  );
}

module.exports = { getKnownBrands, searchBrands, KNOWN_BRANDS };
