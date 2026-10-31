"use client";

import { useEffect, useState } from "react";
import { helpTopics } from "@/lib/help-content";

export function HelpGuide() {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("student");
  useEffect(() => {
    const update = () => setSection(window.location.hash.slice(1) || "student");
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const topics = helpTopics.map(topic => ({ ...topic, items: topic.items.filter(item => words.every(word => `${topic.title} ${item.label} ${item.description}`.toLowerCase().includes(word))) })).filter(topic => topic.items.length);
  return <>
    <div className="help-search"><label><span>기능 찾기</span><input type="search" value={query} placeholder="버튼 이름이나 기능 검색" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setQuery(""); }} /></label>{query && <button className="secondary-button" type="button" onClick={() => setQuery("")}>검색 지우기</button>}</div>
    <nav className="help-topics" aria-label="도움말 주제">{helpTopics.map(topic => <a href={`#${topic.id}`} key={topic.id} onClick={() => { setQuery(""); setSection(topic.id); }}>{topic.title}</a>)}</nav>
    <p className="help-result" role="status">{words.length ? `${topics.reduce((sum, topic) => sum + topic.items.length, 0)}개 항목` : "주제를 펼쳐 버튼별 설명을 확인하세요."}</p>
    <div className="help-sections">{topics.map(topic => <details className="help-topic" key={topic.id + query} id={topic.id} open={words.length > 0 || section === topic.id}>
      <summary>{topic.title}</summary>
      {topic.steps && !words.length && <ol>{topic.steps.map(step => <li key={step}>{step}</li>)}</ol>}
      <dl>{topic.items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.description}</dd></div>)}</dl>
    </details>)}{topics.length === 0 && <p className="help-empty">일치하는 설명이 없습니다. 다른 버튼 이름으로 검색해 주세요.</p>}</div>
  </>;
}
