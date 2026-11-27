                setSearchText(event.target.value)
              }
              autoFocus
            />

            <div style={{ marginTop: "16px" }}>
              {filteredChats.length === 0 && (
                <p className="muted">
                  No conversations found.
                </p>
              )}

              {filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  className="history-item"
                  disabled={loading}
                  onClick={() =>
                    openConversation(chat.id)
                  }
                >
                  {chat.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}

      {settingsOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-label="Settings"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2>Settings</h2>

              <button
                className="icon-button"
                aria-label="Close settings"
                onClick={() =>
                  setSettingsOpen(false)
                }
              >
                <X size={20} />
              </button>
            </div>

            <p>Appearance</p>

            <select
              className="form-input"
              value={theme}
              onChange={(event) =>
                setTheme(
                  event.target.value === "light"
                    ? "light"
                    : "dark"
                )
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>

            <div
              style={{
                marginTop: "24px",
                borderTop: "1px solid var(--border)",
                paddingTop: "16px",
              }}
            >
              <h3>About BLAZE-X</h3>

              <p className="muted">
                Version 1.0.0
              </p>

              <p className="muted">
                Developed by Yuva
              </p>

              <p
                className="muted"
                style={{
                  fontSize: "13px",
                  marginTop: "12px",
                }}
              >
                Chats are stored in your private cloud account. File processing and web search are upcoming modules.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* END OF BLAZE-X MAIN WORKSPACE */
