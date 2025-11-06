# Committing Your Work

Follow these steps to commit changes on the current branch:

1. Review pending changes:
   ```bash
   git status -sb
   ```
2. Inspect diffs and ensure everything looks correct:
   ```bash
   git diff
   ```
3. Stage the files you want to include in the commit:
   ```bash
   git add <file1> <file2>
   # or stage everything that is modified and tracked
   git add -u
   ```
4. Confirm staged files:
   ```bash
   git status -sb
   ```
5. Create the commit with a descriptive message:
   ```bash
   git commit -m "Describe the change"
   ```
6. Push the commit to the remote branch:
   ```bash
   git push
   ```

If you need to amend the most recent commit before pushing, run:

```bash
git commit --amend
```

To remove a staged file before committing, use:

```bash
git restore --staged <file>
```

Refer to the Netlify deployment instructions after committing to ensure your changes are deployed.
