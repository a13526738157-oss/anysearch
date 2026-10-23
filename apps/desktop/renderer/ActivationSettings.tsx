import { useId } from 'react';
import { Info, Keyboard } from 'lucide-react';
import type { DesktopActivationStatus } from '../activation-contracts.ts';
import { IconButton } from './IconButton.tsx';
import './activation-settings.css';

interface Props {
  activation?: DesktopActivationStatus;
  disabled: boolean;
  onToggle(enabled: boolean): void;
}

type ActivationState = 'disabled' | 'starting' | 'ready' | 'unavailable';

const stateLabels: Record<ActivationState, string> = {
  disabled: '已关闭',
  starting: '启动中',
  ready: '就绪',
  unavailable: '不可用',
};

const privacyDescription = '双 Shift 默认关闭。开启前需确认全局 Shift 手势监听，仅本次应用运行有效；其他按键只中断手势，不记录或输出输入文本。';
const readinessDescription = '就绪仅表示服务状态，不代表实际按键投递或焦点恢复已经验证。';

function StateLabel({ state, unavailableLabel = '不可用' }: { state: ActivationState | undefined; unavailableLabel?: string }) {
  return <span className={`activation-state${state === 'unavailable' ? ' unavailable' : ''}`}>
    {state === undefined ? '正在读取' : state === 'unavailable' ? unavailableLabel : stateLabels[state]}
  </span>;
}

export function ActivationSettings({ activation, disabled, onToggle }: Props) {
  const id = useId();
  const toggleId = `${id}-double-shift`;
  const privacyId = `${id}-privacy`;
  const readinessId = `${id}-readiness`;
  const enabled = activation?.doubleShift.enabled ?? false;
  const unavailable = !activation?.supported || activation.service === 'unavailable';
  const toggleDisabled = disabled || (!enabled && unavailable);

  return <section className="activation-settings" aria-label="原生唤起">
    <div className="activation-heading">
      <Keyboard size={16} aria-hidden="true" />
      <h2>原生唤起</h2>
      <IconButton label={`${privacyDescription} ${readinessDescription}`}><Info size={15} aria-hidden="true" /></IconButton>
    </div>
    <label className="activation-option" htmlFor={toggleId}>
      <span>双 Shift 唤起（本次运行）</span>
      <span className="source-switch">
        <input id={toggleId} type="checkbox" checked={enabled} disabled={toggleDisabled}
          aria-describedby={`${privacyId} ${readinessId}`}
          onChange={event => onToggle(event.target.checked)} />
      </span>
    </label>
    <dl className="activation-details" aria-live="polite" aria-describedby={readinessId}>
      <dt>原生服务</dt>
      <dd><StateLabel state={activation?.service} unavailableLabel={activation?.supported === false ? '当前环境不可用' : '不可用'} /></dd>
      <dt>双 Shift</dt>
      <dd><StateLabel state={activation?.doubleShift.state} /></dd>
      <dt>焦点返回</dt>
      <dd><StateLabel state={activation?.focusReturn.state} /></dd>
    </dl>
    <p className="visually-hidden" id={privacyId}>{privacyDescription}</p>
    <p className="visually-hidden" id={readinessId}>{readinessDescription}</p>
  </section>;
}
