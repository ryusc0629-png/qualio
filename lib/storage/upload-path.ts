// 스토리지 업로드용 파일 경로 만들기 — 같은 이름의 파일이 서로를 덮어쓰지 않게 유일한 이름을 붙인다.
//
// 컴포넌트 안에서 Date.now()·Math.random()을 직접 부르면 리액트가 "렌더 중 실행되면
// 화면이 매번 달라진다"고 경고한다(react-hooks/purity). 실제로는 업로드 버튼을 눌렀을 때만
// 실행되지만, 이렇게 파일 밖 함수로 빼두면 경고도 없어지고 세 화면이 같은 규칙을 쓰게 된다.
export function buildUploadPath(folder: string, fileName: string): string {
  const ext = fileName.split('.').pop() ?? 'jpg'
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${folder}/${unique}.${ext}`
}
