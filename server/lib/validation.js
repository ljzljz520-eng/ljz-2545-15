// 内容版本校验：发布缺少必需替代说明的内容版必须被拒绝。
// 必需替代说明（与正文同版）：name / summary / textAlternative / imageAlt。
export const CONTENT_FIELDS = {
  name: { min: 2, max: 60, label: '点位名称' },
  summary: { min: 10, max: 160, label: '一句话说明' },
  textAlternative: { min: 20, max: 1000, label: '文字替代说明' },
  imageAlt: { min: 5, max: 300, label: '图片说明（alt）' },
  easyRead: { optional: true, min: 0, max: 400, label: '易读版说明' }
};

export function validateContentVersion(payload = {}, { publish = false } = {}) {
  const errors = [];
  const clean = {};

  for (const [field, rule] of Object.entries(CONTENT_FIELDS)) {
    const raw = payload[field];
    const value = typeof raw === 'string' ? raw.trim() : '';
    clean[field] = value;

    if (!value) {
      if (!rule.optional) {
        errors.push({ field, message: `${rule.label}为必填项，不能发布缺少${rule.label}的内容版` });
      }
      continue;
    }
    if (value.length < rule.min) {
      errors.push({ field, message: `${rule.label}至少 ${rule.min} 个字符（当前 ${value.length}）` });
    } else if (value.length > rule.max) {
      errors.push({ field, message: `${rule.label}不能超过 ${rule.max} 个字符（当前 ${value.length}）` });
    }
  }

  // 硬性规则：发布（publish=true）时任何必需替代说明缺失都拒绝整个内容版
  if (publish) {
    for (const required of ['name', 'summary', 'textAlternative', 'imageAlt']) {
      if (!clean[required]) {
        errors.push({ field: required, code: 'MISSING_REQUIRED_ALTERNATIVE', message: `发布被拒绝：${CONTENT_FIELDS[required].label}是必需的替代说明` });
      }
    }
  }

  return { valid: errors.length === 0, errors, clean };
}

export function validatePrefsPatch(payload = {}) {
  const errors = [];
  const allowed = {
    baseFontRem: (v) => typeof v === 'number' && v >= 1 && v <= 2,
    highContrast: (v) => typeof v === 'boolean',
    reduceMotion: (v) => typeof v === 'boolean',
    defaultStepFree: (v) => typeof v === 'boolean',
    defaultQuiet: (v) => typeof v === 'boolean'
  };
  const clean = {};
  for (const [k, check] of Object.entries(allowed)) {
    if (payload[k] !== undefined) {
      if (!check(payload[k])) errors.push({ field: k, message: `${k} 的取值不合法` });
      else clean[k] = payload[k];
    }
  }
  if (Object.keys(clean).length === 0) errors.push({ field: '_', message: '没有可更新的偏好字段' });
  return { valid: errors.length === 0, errors, clean };
}
