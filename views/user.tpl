<h4>Your UpMocks</h4>
<ul>
  {{#saved.rows}}
  <li>
    <a href="/user/{{../user_id}}/{{this.id}}/">{{decode this.id}}</a>
    <form action="#delete">
      <input type="hidden" value="{{this.id}}" name="id" />
      <input type="submit" value="delete" />
    </form>
  </li>
  {{/saved.rows}}
</ul>

<h4>Create New UpMock</h4>
<form action="#create" id="create_upmock">
  <input type="text" name="name" placeholder="Name" />
  <input type="submit" value="Create" />
</form>
