import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 에어컨 관련 오타·변형 감지
// 예: 에어켄, 애어컨, 에어컨, 에어콘, 에어컨청소 등
const AC_VARIANTS = /에어[컨켠켄콘]|애어[컨켠켄콘]/

export function isAcService(name: string): boolean {
  return AC_VARIANTS.test(name)
}
