# Interview Studio

설치된 Codex, Claude 또는 Gemini CLI를 이용해 한국어 기술·회사 면접을 연습하는 로컬 Electron 앱입니다. 프로필 자료 정리, 공개 웹 조사, 음성 질문, 로컬 전사, 최대 네 번의 꼬리 질문, 선택적 영상 녹화와 PDF/MP4 결과 내보내기를 제공합니다.

## 설치 및 테스트

- [Windows·macOS 설치 및 테스트 가이드](docs/INSTALLATION_AND_TESTING.md)
- [GitHub Releases](https://github.com/mynameisjinhohong/interview-studio/releases)
- [제품 기준 문서](docs/PRODUCT_PLAN.md)

| 운영체제 | 현재 지원 상태 |
| --- | --- |
| Windows 10 22H2 이상, Windows 11 | 지원. x64 설치 파일은 GitHub Releases에서 제공 |
| macOS 13 이상 | 지원. 현재 배포 파일은 Apple Silicon용 |
| iOS / iPadOS | 미지원. Electron과 로컬 CLI를 사용하는 데스크톱 앱이므로 설치할 수 없음 |

## 개발 실행

```bash
npm install -g pnpm@11
pnpm install
pnpm dev
```

필요 조건:

- Node.js 24
- pnpm 11
- Codex, Claude, Gemini CLI 중 하나의 설치 및 로그인
- 로컬 전사를 위한 whisper.cpp의 `whisper-cli` 또는 `whisper` 실행 파일

앱은 PATH 외에도 macOS Homebrew·사용자 bin, Windows npm·LocalAppData와 앱 `sidecar` 폴더를 탐색합니다. 음성 인식 모델은 앱 설정에서 base/small/medium 중 하나를 내려받습니다. GitHub Actions에서 만든 Windows 설치 파일에는 `whisper.cpp` 실행 파일이 포함됩니다. 소스 실행이나 macOS alpha 설치에서는 운영체제에 맞는 바이너리를 별도로 설치해야 할 수 있습니다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 패키징

```bash
pnpm package:mac
pnpm package:win
```

`package:win`은 Windows x64 환경에서 실행해야 합니다. `better-sqlite3` 네이티브 모듈 때문에 macOS에서 Windows 대상으로 node-gyp 교차 컴파일할 수 없습니다.

데이터는 운영체제의 Interview Studio 애플리케이션 데이터 폴더에 평문으로 저장됩니다.
