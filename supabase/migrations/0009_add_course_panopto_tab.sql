-- 0009: surface Panopto when it's a course-navigation tab.
-- NUS lecturers often add Panopto via the course's left-sidebar tab rather
-- than as a Module Item. Canvas exposes those tabs via /api/v1/courses/:id/tabs;
-- if any tab is an external URL pointing at a Panopto Viewer/Embed page, the
-- sync writes that URL here so the module view can render an embedded player.

alter table courses add column if not exists panopto_tab_url text;
