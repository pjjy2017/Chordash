# Chordash

코드 악보를 텍스트로 빠르게 입력하고 A4 악보(PDF)로 뽑는 앱입니다.

```
title: 샴푸의 요정
key: F

[Verse]
Bb^7, A-7, Bb^7, F B7*
_ 가사 큐
```

- **웹 버전:** https://chordash.app — 브라우저에서 바로 씁니다. 설치 필요 없음.
- **데스크톱(Windows) · 안드로이드 앱:** 웹 기능 + 손글씨·인쇄 악보 사진/PDF를 AI로 읽어 오기, 셋리스트가 곡 파일을 다시 읽기. [Releases](https://github.com/pjjy2017/Chordash/releases)에서 내려받아요.

## 기능

- 단축 입력(`-` 마이너, `^` 메이저7, `%` 하프디미니시, 도수 `2-7`), 실시간 A4 미리보기
- 조옮김(미리보기만 또는 원본에 적용), 코드 이름 ↔ 도수 바꾸기
- 반복기호·엔딩·파트(송폼)·N.C.·악센트·브레스·색 메모
- 텍스트 악보 가져오기(가사 위 코드, 마디선 텍스트, ChordPro, CP949 파일)
- 셋리스트: 여러 곡을 목차 + 쪽 번호가 있는 한 PDF로

문법은 [`docs/SYNTAX.md`](docs/SYNTAX.md), 기능 범위는 [`docs/PRD.md`](docs/PRD.md)를 보세요.

## 오픈소스 · 후원

Chordash는 MIT 라이선스의 오픈소스예요. 자유롭게 쓰고 고쳐서 나눠도 돼요(`LICENSE` 참고). 도움이 되셨다면 후원으로 응원해 주세요 — 후원 링크는 준비 중이에요. 버그나 의견은 GitHub Issues에 남겨 주세요.

## 개발

```powershell
npm install
npm run dev        # 데스크톱 앱
npm run dev:web    # 웹 버전
npm test
```
