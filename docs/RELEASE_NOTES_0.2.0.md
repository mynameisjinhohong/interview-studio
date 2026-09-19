# Interview Studio 0.2.0 alpha

사용자 컨텍스트 수집과 초기 CLI 연결 흐름을 개선한 Windows 테스트 빌드입니다.

주요 변경 사항:

- 최초 실행에서 선택한 Codex·Claude·Gemini CLI의 실제 구조화 호출을 검증
- 일반 URL 직접 추출 실패 시 선택한 CLI의 공개 웹 수집으로 자동 재시도
- 자료별 성공·실패, 수집 방식, 추출 문자 수와 실제 오류 표시
- Notion 등 동적 페이지 실패 시 직접 설명을 붙여 넣는 보완 경로 제공
- LLM이 부족한 경력·역할·성과 정보를 후속 질문으로 생성
- 보완 답변을 로컬 자료로 저장하고 컨텍스트를 재생성
- 기존 0.1.0 데이터베이스 자동 마이그레이션
- Windows 설치본에 FFmpeg와 whisper.cpp sidecar 포함

코드 서명하지 않은 개인용 prerelease입니다. Windows SmartScreen 경고가 나타날 수 있습니다.
