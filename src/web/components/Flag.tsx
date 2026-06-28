import clsx from 'clsx';
import { AU, BR, CA, DE, GB, HK, IE, IN, JP, KR, SG, US } from 'country-flag-icons/react/3x2';
import type { ComponentType } from 'react';

// Real SVG flags render identically across platforms (Windows does not draw flag emoji).
const REGION_FLAG: Record<string, ComponentType<{ className?: string }>> = {
  'eu-west-1': IE,
  'eu-west-2': GB,
  'eu-central-1': DE,
  'us-east-1': US,
  'us-east-2': US,
  'us-west-1': US,
  'us-west-2': US,
  'ca-central-1': CA,
  'sa-east-1': BR,
  'ap-southeast-1': SG,
  'ap-southeast-2': AU,
  'ap-northeast-1': JP,
  'ap-northeast-2': KR,
  'ap-east-1': HK,
  'ap-south-1': IN,
};

interface Props {
  region: string;
  className?: string;
}

export function Flag({ region, className = 'h-5 w-[30px]' }: Props) {
  const F = REGION_FLAG[region];
  return (
    <span
      className={clsx('inline-flex shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/30 shadow-sm', className)}
    >
      {F ? <F className="h-full w-full" /> : <span className="h-full w-full bg-void-600" />}
    </span>
  );
}
