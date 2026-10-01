// 筛选条件：任何变化都更新共享查询状态，并驱动"筛选后焦点恢复"流程。
import { say } from './announcer.js';

export function createFilters({ store, onApplied }) {
  const form = document.getElementById('filters-form');
  const clearBtn = document.getElementById('clear-filters');
  const inputs = {
    keyword: document.getElementById('f-keyword'),
    kind: document.getElementById('f-kind'),
    stepFree: document.getElementById('f-stepfree'),
    wheelchair: document.getElementById('f-wheelchair'),
    quiet: document.getElementById('f-quiet'),
    seating: document.getElementById('f-seating'),
    toilet: document.getElementById('f-toilet')
  };

  function read() {
    return {
      keyword: inputs.keyword.value,
      kind: inputs.kind.value,
      stepFree: inputs.stepFree.checked,
      wheelchair: inputs.wheelchair.checked,
      quiet: inputs.quiet.checked,
      seating: inputs.seating.checked,
      toilet: inputs.toilet.checked
    };
  }

  function apply(filterChanged = true) {
    const filters = read();
    store.set({ filters });
    onApplied({ filterChanged });
  }

  // 复选框与下拉：立即筛选（焦点仍在原控件，列表侧负责恢复列表焦点的播报）
  for (const el of [inputs.kind, inputs.stepFree, inputs.wheelchair, inputs.quiet, inputs.seating, inputs.toilet]) {
    el.addEventListener('change', () => apply(true));
  }
  // 关键词：防抖
  let t;
  inputs.keyword.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => apply(true), 350);
  });

  clearBtn.addEventListener('click', () => {
    inputs.keyword.value = '';
    inputs.kind.value = '';
    for (const k of ['stepFree', 'wheelchair', 'quiet', 'seating', 'toilet']) inputs[k].checked = false;
    apply(true);
    say('已清空全部筛选条件，显示全部点位。');
    inputs.keyword.focus();
  });

  // 暴露给"无定位授权"等场景的编程式筛选
  return {
    apply,
    setQuick(filter) {
      Object.entries(filter).forEach(([k, v]) => {
        if (inputs[k]) {
          if (typeof inputs[k] === 'object' && 'checked' in inputs[k]) inputs[k].checked = v;
          else inputs[k].value = v;
        }
      });
      apply(true);
    }
  };
}
