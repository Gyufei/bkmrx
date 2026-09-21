import { toast } from '@/components/ui/toast';

export async function copyToClipboard(text: string, successMessage = '已复制到剪贴板') {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ type: 'success', title: successMessage });
  } catch {
    toast.add({ type: 'error', title: '复制失败' });
  }
}
