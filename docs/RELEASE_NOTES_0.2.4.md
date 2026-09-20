# Interview Studio 0.2.4 alpha

첫 답변을 제출한 뒤 STT 모델 누락으로 면접이 종료되던 문제를 시작 전 준비 절차로 이동한 패치입니다.

주요 변경 사항:

- 최초 실행에서 CLI, `whisper-cli`, 권장 `small` 모델, 한국어 면접관 음성과 샘플 재생을 모두 확인
- 기존 사용자에게도 확장된 고품질 환경 설정을 한 번 다시 안내
- 모든 면접의 장치 점검에서 마이크, 선택 STT 모델, 실제 질문 음성 출력을 재검증
- 필수 STT 모델이 없으면 첫 답변 이후가 아니라 면접 시작 전에 원클릭 다운로드 제공
- main process에서도 STT 준비 상태를 다시 검사해 UI 우회를 차단
- Windows에서 최신 OneCore 음성 엔진을 우선 사용하고 기존 System.Speech는 폴백으로 유지
- 설치된 한국어 음성 중 최신·자연 음성 후보를 우선 추천하고 0.9배속을 초기 권장값으로 적용
- 초기 설정 및 Windows OneCore 음성 회귀 테스트 추가

코드 서명하지 않은 개인용 prerelease입니다. Windows SmartScreen 또는 macOS Gatekeeper 경고가 나타날 수 있습니다.
