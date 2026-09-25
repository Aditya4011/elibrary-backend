(function () {
  "use strict";

  var TOKEN_KEY = "stackroom_token";
  var API = ""; // same origin

  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  var currentUser = null;

  // ---------- Toast ----------
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = "toast"; }, 2600);
  }

  // ---------- Theme ----------
  var THEME_KEY = "stackroom_theme";
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  document.getElementById("theme-btn").addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  // ---------- API helper ----------
  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    var token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    if (!(opts.body instanceof FormData) && opts.body && typeof opts.body !== "string") {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var err = new Error(data.error || ("Request failed (" + res.status + ")"));
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
  }

  // ---------- Auth screen wiring ----------
  var authTabs = document.querySelectorAll(".auth-tab");
  authTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      authTabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var mode = tab.getAttribute("data-mode");
      document.getElementById("login-form").classList.toggle("active", mode === "login");
      document.getElementById("register-form").classList.toggle("active", mode === "register");
    });
  });

  var regRole = "student";
  document.querySelectorAll("#register-form .role-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#register-form .role-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      regRole = btn.getAttribute("data-role");
      document.getElementById("reg-dept-field").style.display = regRole === "admin" ? "none" : "block";
    });
  });

  document.getElementById("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("li-email").value.trim();
    var password = document.getElementById("li-password").value;
    document.getElementById("login-error").textContent = "";
    api("/api/auth/login", { method: "POST", body: { email: email, password: password } })
      .then(function (data) {
        setToken(data.token);
        currentUser = data.user;
        enterApp();
      })
      .catch(function (err) { document.getElementById("login-error").textContent = err.message; });
  });

  document.getElementById("register-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("re-name").value.trim();
    var email = document.getElementById("re-email").value.trim();
    var password = document.getElementById("re-password").value;
    var department = document.getElementById("re-dept").value;
    document.getElementById("register-error").textContent = "";
    api("/api/auth/register", { method: "POST", body: { name: name, email: email, password: password, role: regRole, department: department } })
      .then(function (data) {
        setToken(data.token);
        currentUser = data.user;
        enterApp();
      })
      .catch(function (err) { document.getElementById("register-error").textContent = err.message; });
  });

  document.getElementById("logout-btn").addEventListener("click", function () {
    clearToken();
    currentUser = null;
    document.getElementById("app-screen").classList.remove("active");
    document.getElementById("auth-screen").classList.add("active");
  });

  function tryRestoreSession() {
    var token = getToken();
    if (!token) return;
    api("/api/auth/me").then(function (data) {
      currentUser = data.user;
      enterApp();
    }).catch(function () { clearToken(); });
  }

  function enterApp() {
    document.getElementById("auth-screen").classList.remove("active");
    document.getElementById("app-screen").classList.add("active");
    document.getElementById("who-name").textContent = currentUser.name;
    document.getElementById("who-role").textContent = currentUser.role === "admin" ? "Librarian" : ("Student · " + currentUser.department);
    document.getElementById("admin-tab-btn").style.display = currentUser.role === "admin" ? "inline-block" : "none";
    renderFacets();
    renderBrowse();
  }

  // ---------- Tabs ----------
  document.getElementById("tabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab-btn");
    if (!btn) return;
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    var view = btn.getAttribute("data-view");
    document.getElementById("view-browse").style.display = view === "browse" ? "block" : "none";
    document.getElementById("view-admin").style.display = view === "admin" ? "block" : "none";
    if (view === "admin") renderAdminList();
  });

  // ---------- Filters ----------
  var activeFilters = { type: null, department: null, year: null };
  var TYPES = ["Book", "Notes", "Previous-Year Paper", "Study Material", "Reference"];
  var DEPTS = ["Computer Science", "Electronics & Communication", "Mechanical Engineering", "Civil Engineering", "Mathematics", "General / All Departments"];
  var YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderFacets() {
    api("/api/resources/facets").then(function (data) {
      renderFilterGroup("filter-type", TYPES, "type", data.byType, "type");
      renderFilterGroup("filter-dept", DEPTS, "department", data.byDept, "department");
      renderFilterGroup("filter-year", YEARS, "year", data.byYear, "year");
    }).catch(function (err) { toast(err.message, true); });
  }

  function renderFilterGroup(elId, options, key, counts, countKey) {
    var el = document.getElementById(elId);
    el.innerHTML = "";
    var countMap = {};
    (counts || []).forEach(function (row) { countMap[row[countKey]] = row.count; });
    options.forEach(function (opt) {
      var count = countMap[opt] || 0;
      if (count === 0) return;
      var div = document.createElement("div");
      div.className = "filter-opt" + (activeFilters[key] === opt ? " active" : "");
      div.innerHTML = "<span>" + escapeHtml(opt) + "</span><span class='count mono'>" + count + "</span>";
      div.addEventListener("click", function () {
        activeFilters[key] = activeFilters[key] === opt ? null : opt;
        renderFacets();
        renderBrowse();
      });
      el.appendChild(div);
    });
  }

  document.getElementById("clear-filters").addEventListener("click", function () {
    activeFilters = { type: null, department: null, year: null };
    document.getElementById("search-input").value = "";
    renderFacets();
    renderBrowse();
  });

  var searchDebounce = null;
  document.getElementById("search-input").addEventListener("input", function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(renderBrowse, 250);
  });
  document.getElementById("sort-select").addEventListener("change", renderBrowse);

  function buildQuery() {
    var params = new URLSearchParams();
    if (activeFilters.type) params.set("type", activeFilters.type);
    if (activeFilters.department) params.set("department", activeFilters.department);
    if (activeFilters.year) params.set("year", activeFilters.year);
    var q = document.getElementById("search-input").value.trim();
    if (q) params.set("q", q);
    params.set("sort", document.getElementById("sort-select").value);
    return params.toString();
  }

  function renderBrowse() {
    api("/api/resources?" + buildQuery()).then(function (data) {
      var list = data.resources;
      document.getElementById("result-count").textContent = list.length + (list.length === 1 ? " resource on the shelf" : " resources on the shelf");
      var labelBits = [];
      if (activeFilters.type) labelBits.push(activeFilters.type.toUpperCase());
      if (activeFilters.department) labelBits.push(activeFilters.department.toUpperCase());
      if (activeFilters.year) labelBits.push(activeFilters.year.toUpperCase());
      document.getElementById("drawer-label").textContent = "DRAWER — " + (labelBits.length ? labelBits.join(" / ") : "ALL RESOURCES");

      var container = document.getElementById("entry-list");
      var empty = document.getElementById("empty-state");
      container.innerHTML = "";
      if (list.length === 0) { empty.style.display = "block"; return; }
      empty.style.display = "none";
      list.forEach(function (r) { container.appendChild(buildEntry(r, false)); });
    }).catch(function (err) { toast(err.message, true); });
  }

  function buildEntry(r, isAdmin) {
    var entry = document.createElement("div");
    entry.className = "entry";
    entry.innerHTML =
      "<div class='callnum mono'>" + escapeHtml(r.callNumber) + "</div>" +
      "<div class='body'>" +
        "<h3>" + escapeHtml(r.title) + "</h3>" +
        "<div class='meta'><span>" + escapeHtml(r.author || "Uploaded by librarian") + "</span><span>" + escapeHtml(r.department) + "</span><span>" + escapeHtml(r.year) + "</span></div>" +
        (r.description ? "<div class='desc'>" + escapeHtml(r.description) + "</div>" : "") +
        "<div class='tag-row'><span class='tag type'>" + escapeHtml(r.type) + "</span><span class='tag'>" + escapeHtml(r.subject) + "</span>" +
        (r.hasFile ? "" : "<span class='tag nofile'>No file uploaded</span>") +
        "</div>" +
      "</div>" +
      "<div class='actions'></div>";

    var actions = entry.querySelector(".actions");
    if (isAdmin) {
      var editBtn = document.createElement("button");
      editBtn.className = "act-btn"; editBtn.type = "button"; editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () { openEditForm(r); });
      var delBtn = document.createElement("button");
      delBtn.className = "act-btn danger"; delBtn.type = "button"; delBtn.textContent = "Remove";
      delBtn.addEventListener("click", function () { removeResource(r.id, r.title); });
      actions.appendChild(editBtn); actions.appendChild(delBtn);
    } else {
      var viewBtn = document.createElement("button");
      viewBtn.className = "act-btn"; viewBtn.type = "button"; viewBtn.textContent = "View";
      viewBtn.disabled = !r.hasFile;
      viewBtn.addEventListener("click", function () { fetchAndOpenFile(r.id, "view", r.title); });
      var dlBtn = document.createElement("button");
      dlBtn.className = "act-btn primary"; dlBtn.type = "button"; dlBtn.textContent = "Download";
      dlBtn.disabled = !r.hasFile;
      dlBtn.addEventListener("click", function () { fetchAndOpenFile(r.id, "download", r.title); });
      actions.appendChild(viewBtn); actions.appendChild(dlBtn);
    }
    return entry;
  }

  // Fetch the PDF with the auth header, then open it (view in new tab) or save it (download)
  function fetchAndOpenFile(id, mode, title) {
    var token = getToken();
    fetch("/api/resources/" + id + "/file?mode=" + mode, { headers: { Authorization: "Bearer " + token } })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || "Could not open file."); });
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        if (mode === "view") {
          window.open(url, "_blank");
        } else {
          var a = document.createElement("a");
          a.href = url;
          a.download = (title || "resource").replace(/[^a-z0-9]+/gi, "_").slice(0, 60) + ".pdf";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast("Downloading “" + title + "”…");
        }
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      })
      .catch(function (err) { toast(err.message, true); });
  }

  // ---------- Admin ----------
  function renderAdminList() {
    api("/api/resources?sort=recent").then(function (data) {
      document.getElementById("admin-count").textContent = data.resources.length;
      var container = document.getElementById("admin-entry-list");
      container.innerHTML = "";
      data.resources.forEach(function (r) { container.appendChild(buildEntry(r, true)); });
    }).catch(function (err) { toast(err.message, true); });
  }

  var adminForm = document.getElementById("admin-form");
  document.getElementById("add-new-btn").addEventListener("click", function () {
    document.getElementById("edit-id").value = "";
    document.getElementById("admin-form-title").textContent = "Add a resource";
    ["f-title", "f-subject", "f-author", "f-description"].forEach(function (id) { document.getElementById(id).value = ""; });
    document.getElementById("f-type").selectedIndex = 0;
    document.getElementById("f-dept").selectedIndex = 0;
    document.getElementById("f-year").selectedIndex = 0;
    document.getElementById("f-file").value = "";
    document.getElementById("f-file-note").textContent = "";
    document.getElementById("admin-form-error").textContent = "";
    adminForm.classList.add("open");
    document.getElementById("f-title").focus();
  });
  document.getElementById("cancel-form-btn").addEventListener("click", function () { adminForm.classList.remove("open"); });

  function openEditForm(r) {
    document.getElementById("edit-id").value = r.id;
    document.getElementById("admin-form-title").textContent = "Edit resource";
    document.getElementById("f-title").value = r.title;
    document.getElementById("f-type").value = r.type;
    document.getElementById("f-subject").value = r.subject;
    document.getElementById("f-dept").value = r.department;
    document.getElementById("f-year").value = r.year;
    document.getElementById("f-author").value = r.author || "";
    document.getElementById("f-description").value = r.description || "";
    document.getElementById("f-file").value = "";
    document.getElementById("f-file-note").textContent = r.hasFile ? "(current: " + r.originalFilename + " — choose a new file to replace it)" : "(no file uploaded yet)";
    document.getElementById("admin-form-error").textContent = "";
    adminForm.classList.add("open");
    document.getElementById("f-title").focus();
  }

  function removeResource(id, title) {
    if (!window.confirm("Remove “" + title + "” from the shelf? This can't be undone.")) return;
    api("/api/resources/" + id, { method: "DELETE" })
      .then(function () {
        toast("Removed “" + title + "”.");
        renderAdminList();
        renderFacets();
        renderBrowse();
      })
      .catch(function (err) { toast(err.message, true); });
  }

  adminForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var editId = document.getElementById("edit-id").value;
    var fd = new FormData();
    fd.append("title", document.getElementById("f-title").value.trim());
    fd.append("type", document.getElementById("f-type").value);
    fd.append("subject", document.getElementById("f-subject").value.trim());
    fd.append("department", document.getElementById("f-dept").value);
    fd.append("year", document.getElementById("f-year").value);
    fd.append("author", document.getElementById("f-author").value.trim());
    fd.append("description", document.getElementById("f-description").value.trim());
    var fileInput = document.getElementById("f-file");
    if (fileInput.files && fileInput.files[0]) fd.append("file", fileInput.files[0]);

    document.getElementById("admin-form-error").textContent = "";
    var path = editId ? "/api/resources/" + editId : "/api/resources";
    var method = editId ? "PUT" : "POST";

    api(path, { method: method, body: fd })
      .then(function (data) {
        toast(editId ? "Saved changes to “" + data.resource.title + "”." : "Added “" + data.resource.title + "” to the shelf.");
        adminForm.classList.remove("open");
        renderAdminList();
        renderFacets();
        renderBrowse();
      })
      .catch(function (err) { document.getElementById("admin-form-error").textContent = err.message; });
  });

  // ---------- Boot ----------
  tryRestoreSession();
})();
