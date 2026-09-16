import type { PageFieldDescriptor } from '../shared/form';

export interface FailureFeedback {
  title: string;
  action: string;
  category: 'page' | 'format' | 'option' | 'verification' | 'manual';
}

export function failureFeedback(reason: string): FailureFeedback {
  const normalized = reason.toLowerCase();
  if (normalized.includes('unavailable') || normalized.includes('not found')) {
    return { title: '页面字段已变化或暂不可用', action: '请重新扫描页面；如果字段刚刚出现，先等待页面加载完成。', category: 'page' };
  }
  if (normalized.includes('date input')) {
    return { title: '日期格式无法写入', action: '请改成有效日期，例如 2026-09-16。', category: 'format' };
  }
  if (normalized.includes('month input')) {
    return { title: '月份格式无法写入', action: '请改成有效月份，例如 2026-09。', category: 'format' };
  }
  if (normalized.includes('number input') || normalized.includes('numeric')) {
    return { title: '该字段只接受数字', action: '请删除单位或其他文字后重试。', category: 'format' };
  }
  if (normalized.includes('checkbox requires a boolean')) {
    return { title: '复选框资料格式不正确', action: '请把本地资料修改为“是”或“否”后重试。', category: 'format' };
  }
  if (normalized.includes('requires a string or number')) {
    return { title: '资料值类型不适用于该字段', action: '请修改本地资料或在招聘页面手动填写。', category: 'format' };
  }
  if (normalized.includes('no matching option') || normalized.includes('no exact option')) {
    return { title: '没有找到完全一致的选项', action: '请在招聘页面手动选择，或修改待填值后重试。', category: 'option' };
  }
  if (normalized.includes('ambiguous')) {
    return { title: '存在多个相同候选项', action: '为避免选错，请在招聘页面手动选择。', category: 'option' };
  }
  if (normalized.includes('verified') || normalized.includes('verification') || normalized.includes('does not match')) {
    return { title: '页面没有保留写入结果', action: '该字段可能受网页组件控制，请定位后手动确认或重试。', category: 'verification' };
  }
  if (normalized.includes('file input') || normalized.includes('manual interaction')) {
    return { title: '该字段需要手动处理', action: '请回到招聘页面完成文件选择或组件交互。', category: 'manual' };
  }
  return { title: '字段未能自动填写', action: '请定位字段后手动处理；页面变化时可先重新扫描。', category: 'manual' };
}

export function fieldPreparationHint(field: PageFieldDescriptor): string | undefined {
  if (field.inputType === 'date') return '日期会转换为 YYYY-MM-DD；无效日期不会写入。';
  if (field.inputType === 'month') return '日期会转换为 YYYY-MM；无效月份不会写入。';
  if (field.kind === 'select') return '只会选择值或文字完全一致的原生选项。';
  if (field.kind === 'combobox') return '只会选择唯一且完全一致的候选项，避免误选。';
  return undefined;
}
